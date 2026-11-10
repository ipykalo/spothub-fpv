import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { type CurrentUserDto, UserStatus } from '@spothub/shared';

import { SettingsFacade } from '../../settings';
import { AuthProviderKind, type UserEntity, UsersFacade } from '../../users';
import type { GoogleProfile } from '../auth.types';
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
    private readonly users: UsersFacade,
    private readonly settings: SettingsFacade,
    private readonly tokens: TokenService,
  ) {}

  async signInWithGoogle(profile: GoogleProfile): Promise<IssuedTokens> {
    // Asked at every sign-in, so a change on the Admin page needs no restart.
    if (!(await this.settings.permitsSignIn(profile.email))) {
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

    if (user.status === UserStatus.Blocked) {
      this.logger.warn(`Rejected sign-in for a blocked account`);
      throw new ForbiddenException('This account has been blocked');
    }

    return this.tokens.issueForLogin(user);
  }

  /** A blocked account's refresh fails like a deleted one's: its family is revoked. */
  refresh(refreshToken: string): Promise<IssuedTokens> {
    return this.tokens.rotate(refreshToken, async (id) => {
      const user = await this.users.findById(id);
      return user?.status === UserStatus.Blocked ? null : user;
    });
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
      status: user.status,
    };
  }
}
