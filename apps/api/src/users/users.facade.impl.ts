import {
  ConflictException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Role, type StorageUsageDto } from '@spothub/shared';

import { SettingsFacade } from '../settings';
import { StorageGateway } from '../storage';
import { UsersFacade } from './abstract/users.facade';
import { UsersRepository } from './abstract/users.repository';
import { describeBytes, fits, storageLimit } from './storage-allowance';
import type { AuthProviderKind, LinkIdentityInput, UserEntity } from './user.entity';

/** Serves the users facade out of the module's own repository. */
@Injectable()
export class UsersFacadeImpl extends UsersFacade {
  private readonly logger = new Logger(UsersFacadeImpl.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly settings: SettingsFacade,
    private readonly storage: StorageGateway,
  ) {
    super();
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findById(id);
  }

  upsertFromIdentity(input: LinkIdentityInput): Promise<UserEntity> {
    return this.users.upsertFromIdentity(input);
  }

  async findForSignIn(
    provider: AuthProviderKind,
    subject: string,
    email: string,
  ): Promise<UserEntity | null> {
    return (
      (await this.users.findByProviderSubject(provider, subject)) ??
      (await this.users.findByEmail(email))
    );
  }

  recordSignInCountry(userId: string, country: string | null): Promise<void> {
    return this.users.recordSignInCountry(userId, country);
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

  /**
   * Files first, then rows. Every key a pilot's uploads were stored under
   * starts with their id — photos, post images, flight logs, spot covers —
   * so one prefix finds them all. If storage fails, nothing else is touched
   * and the pilot can try again; deleting the rows first would leave files
   * nothing points at, and nobody to ask to remove them.
   */
  async deleteAccount(userId: string): Promise<void> {
    const user = await this.users.findById(userId);

    if (!user) {
      return;
    }

    if (user.role === Role.Admin && (await this.users.countAdmins()) <= 1) {
      throw new ConflictException(
        'You are the only admin. Make someone else an admin before deleting your account.',
      );
    }

    const files = await this.storage.deletePrefix(`${userId}/`);
    await this.users.delete(userId);

    this.logger.log(`Deleted an account and ${String(files)} stored file(s)`);
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
