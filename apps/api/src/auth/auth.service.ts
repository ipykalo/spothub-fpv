import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { CurrentUserDto } from '@spothub/shared';

import { AuthProviderKind, type UserEntity } from '../users/user.entity';
import { UsersRepository } from '../users/users.repository';
import { AllowlistService } from './allowlist.service';
import type { GoogleProfile } from './auth.types';
import { IssuedTokens, TokenService } from './token.service';

/**
 * Orchestrates sign-in: admission, account linking, token issuing.
 *
 * Each of those is delegated — this class decides the sequence, not the
 * details.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly allowlist: AllowlistService,
    private readonly tokens: TokenService,
  ) {}

  async signInWithGoogle(profile: GoogleProfile): Promise<IssuedTokens> {
    if (!this.allowlist.permits(profile.email)) {
      this.logger.warn(`Rejected sign-in for non-allowlisted address`);
      throw new ForbiddenException('This account is not allowed to sign in');
    }

    const user = await this.users.upsertFromIdentity({
      provider: AuthProviderKind.Google,
      subject: profile.subject,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    });

    return this.tokens.issueForLogin(user);
  }

  refresh(refreshToken: string): Promise<IssuedTokens> {
    return this.tokens.rotate(refreshToken, (id) => this.users.findById(id));
  }

  signOut(refreshToken: string | undefined): Promise<void> {
    return refreshToken ? this.tokens.revokeFamilyOf(refreshToken) : Promise.resolve();
  }

  async currentUser(userId: string): Promise<CurrentUserDto | null> {
    const user = await this.users.findById(userId);
    return user ? AuthService.toDto(user) : null;
  }

  private static toDto(user: UserEntity): CurrentUserDto {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
