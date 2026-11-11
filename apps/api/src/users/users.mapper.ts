import type { AdminUserDto, StorageUsageDto } from '@spothub/shared';

import type { UserEntity } from './user.entity';

/**
 * The single place a user becomes the Admin page's row. Explicit, so a column
 * added to `users` is not published by accident. Usage is passed in: it is a
 * sum over other tables, worked out once for the whole list.
 */
export function toAdminUserDto(
  user: UserEntity,
  viewerId: string,
  storage: StorageUsageDto,
): AdminUserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    pilotName: user.pilotName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    status: user.status,
    isViewer: user.id === viewerId,
    createdAt: user.createdAt.toISOString(),
    lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
    storageUsedBytes: storage.usedBytes,
    storageLimitBytes: storage.limitBytes,
    storageQuotaBytes: user.storageQuotaBytes,
    lastSignInCountry: user.lastSignInCountry,
  };
}
