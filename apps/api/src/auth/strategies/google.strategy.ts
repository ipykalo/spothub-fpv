import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

import type { Env } from '../../config/env.schema';
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
      displayName: profile.displayName || null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    done(null, googleProfile);
  }
}
