import { Injectable, PayloadTooLargeException } from '@nestjs/common';
import type { StorageUsageDto } from '@spothub/shared';

import { SettingsFacade } from '../settings';
import { UsersFacade } from './abstract/users.facade';
import { UsersRepository } from './abstract/users.repository';
import { describeBytes, fits, storageLimit } from './storage-allowance';
import type { LinkIdentityInput, UserEntity } from './user.entity';

/** Serves the users facade out of the module's own repository. */
@Injectable()
export class UsersFacadeImpl extends UsersFacade {
  constructor(
    private readonly users: UsersRepository,
    private readonly settings: SettingsFacade,
  ) {
    super();
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findById(id);
  }

  upsertFromIdentity(input: LinkIdentityInput): Promise<UserEntity> {
    return this.users.upsertFromIdentity(input);
  }

  async storageUsage(userId: string): Promise<StorageUsageDto> {
    const [user, used, fallback] = await Promise.all([
      this.users.findById(userId),
      this.users.storageUsedBy([userId]),
      this.settings.defaultStorageQuotaBytes(),
    ]);

    return {
      usedBytes: used.get(userId) ?? 0,
      limitBytes: storageLimit(user?.storageQuotaBytes ?? null, fallback),
    };
  }

  async assertCanStore(userId: string, bytes: number): Promise<void> {
    const { usedBytes, limitBytes } = await this.storageUsage(userId);

    if (!fits(usedBytes, bytes, limitBytes)) {
      throw new PayloadTooLargeException(
        `Your storage is full: ${describeBytes(usedBytes)} of ${describeBytes(limitBytes)} used. ` +
          'Delete some photos or logs, or ask the admin for more room.',
      );
    }
  }
}
