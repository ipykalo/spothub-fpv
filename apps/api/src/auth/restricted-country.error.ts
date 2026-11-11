import { ForbiddenException } from '@nestjs/common';

/**
 * A sign-in from a country on the restricted list. Its own class so the
 * Google callback can say why on the login page, rather than the general
 * "not allowed" any other refusal gets.
 */
export class RestrictedCountryError extends ForbiddenException {
  constructor() {
    super('Signing in is not available from your country');
  }
}
