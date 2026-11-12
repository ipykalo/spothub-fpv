import { ForbiddenException } from '@nestjs/common';

/**
 * A Google account whose email Google has not verified. Its own class so the
 * Google callback can say why on the login page: unlike the other refusals,
 * the pilot can fix this one themselves.
 */
export class UnverifiedEmailError extends ForbiddenException {
  constructor() {
    super('Verify this email address with Google before signing in');
  }
}
