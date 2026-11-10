import type { AdminUserDto } from '@spothub/shared';

import type { UserEntity } from './user.entity';

/**
 * The single place a user becomes the Admin page's row. Explicit, so a column
 * added to `users` is not published by accident.
 */
export function toAdminUserDto(user: UserEntity, viewerId: string): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    isViewer: user.id === viewerId,
    createdAt: user.createdAt.toISOString(),
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
  };
}
