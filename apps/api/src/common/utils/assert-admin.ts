import { ForbiddenException } from '@nestjs/common';
import { Role } from '@spothub/shared';

import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * The Admin page's routes are signed-in like every other; whether the caller
 * is an admin is checked here, by role, in the service that serves them.
 *
 * 403 rather than 404: the routes' existence is no secret, and a signed-in
 * pilot who opens one should be told plainly that it is not theirs.
 */
export function assertAdmin(user: AuthenticatedUser): void {
  if (user.role !== Role.Admin) {
    throw new ForbiddenException('Only an admin can do that');
  }
}
