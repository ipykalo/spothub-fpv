import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

import type { Env } from '../../config';
import type { GoogleProfile } from '../auth.types';

/**
 * Translates Google's profile into our own shape and nothing more.
 *
 * Admission and account linking happen in AuthService — a strategy that also
 * decided who may sign in would be doing two jobs.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService<Env, true>) {
    super({
      clientID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      callbackURL: config.get('GOOGLE_CALLBACK_URL', { infer: true }),
      scope: ['email', 'profile'],
    });
  }

  /**
   * Always shows Google's account chooser. Without it, Google silently
   * continues with the account the browser is signed in to, so after signing
   * out of SpotHub a second click on "Continue with Google" lands straight
   * back in the same account, with no way to pick another one.
   */
  override authorizationParams(): Record<string, string> {
    return { prompt: 'select_account' };
  }

  override validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;

    if (!email) {
      done(new Error('Google account has no email address'), false);
      return;
    }

    const googleProfile: GoogleProfile = {
      // `profile.id` is Google's `sub` claim — stable for the life of the
      // account, unlike the email.
      subject: profile.id,
      email: email.toLowerCase(),
      // Google's own claim, read raw: a response without it is unverified.
      emailVerified: profile._json.email_verified === true,
      displayName: profile.displayName || null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, googleProfile);
  }
}
