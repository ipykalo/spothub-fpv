import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { type CurrentUserDto, publicName, Role, UserStatus } from '@spothub/shared';

import { CountryLookup } from '../../geo';
import { SettingsFacade } from '../../settings';
import { RestrictedCountryError } from '../restricted-country.error';
import { UnverifiedEmailError } from '../unverified-email.error';
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
    private readonly countries: CountryLookup,
  ) {}

  /**
   * `ip` is the visitor's own address (behind Caddy, from X-Forwarded-For);
   * the country it is in decides whether a restricted country refuses them.
   */
  async signInWithGoogle(profile: GoogleProfile, ip?: string): Promise<IssuedTokens> {
    // First, before anything reads the address: the allowlist matches on it,
    // and an identity not seen before is linked to the account that has it.
    // Unverified, it is only a claim — anyone could create a Google account
    // under someone else's address and walk into their hangar.
    if (!profile.emailVerified) {
      this.logger.warn(`Rejected sign-in with an unverified email address`);
      throw new UnverifiedEmailError();
    }

    // Asked at every sign-in, so a change on the Admin page needs no restart.
    if (!(await this.settings.permitsSignIn(profile.email))) {
      this.logger.warn(`Rejected sign-in for non-allowlisted address`);
      throw new ForbiddenException('This account is not allowed to sign in');
    }

    const country = this.countries.countryOf(ip);
    await this.refuseRestrictedCountry(profile, country);

    const user = await this.users.upsertFromIdentity({
      provider: AuthProviderKind.Google,
      subject: profile.subject,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      country,
    });

    if (user.status === UserStatus.Blocked) {
      this.logger.warn(`Rejected sign-in for a blocked account`);
      throw new ForbiddenException('This account has been blocked');
    }

    return this.tokens.issueForLogin(user);
  }

  /**
   * Nobody signs in from a restricted country — not a new pilot, and not one
   * already registered — except an admin, who must never be locked out of
   * their own site by travelling. A refused pilot's country is still noted,
   * so the Admin page shows where the attempt came from. An address that
   * cannot be placed is not refused: a missing database must not lock
   * everyone out.
   */
  private async refuseRestrictedCountry(
    profile: GoogleProfile,
    country: string | null,
  ): Promise<void> {
    if (country === null || !(await this.settings.blockedCountries()).includes(country)) {
      return;
    }

    const existing = await this.users.findForSignIn(
      AuthProviderKind.Google,
      profile.subject,
      profile.email,
    );

    if (existing?.role === Role.Admin) {
      return;
    }

    if (existing) {
      await this.users.recordSignInCountry(existing.id, country);
    }

    this.logger.warn(`Rejected sign-in from a restricted country (${country})`);
    throw new RestrictedCountryError();
  }

  /** A blocked account's refresh fails like a deleted one's: its family is revoked. */
  refresh(refreshToken: string): Promise<IssuedTokens> {
    return this.tokens.rotate(refreshToken, async (id) => {
      const user = await this.users.findById(id);
      return user?.status === UserStatus.Blocked ? null : user;
    });
  }

  /** Every row and file the account owns goes with it, its sessions included. */
  deleteAccount(userId: string): Promise<void> {
    return this.users.deleteAccount(userId);
  }

  /**
   * Ends every session the pilot has — a phone left signed in, a borrowed
   * laptop — not just this one. Each device's next refresh is refused; an
   * access token it already holds runs out within its 15 minutes.
   */
  signOutEverywhere(userId: string): Promise<void> {
    return this.tokens.revokeAllFor(userId);
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
      pilotName: user.pilotName,
      publicName: publicName(user.pilotName, user.displayName),
      homeCurrency: user.homeCurrency,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
    };
  }
}
