import type { Role } from '@spothub/shared';

/**
 * The authenticated principal attached to a request by the JWT strategy.
 *
 * Lives in `common/` rather than in `auth/` because every controller in the
 * codebase names it. Keeping it here is what lets the auth barrel export
 * nothing but `AuthModule`.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
}
