import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type AdminUserDto, Role, type UpdateAdminUserDto } from '@spothub/shared';

import { type AuthenticatedUser, assertAdmin } from '../common';
import { SettingsFacade } from '../settings';
import { UsersRepository } from './abstract/users.repository';
import { storageLimit } from './storage-allowance';
import type { UserEntity } from './user.entity';
import { toAdminUserDto } from './users.mapper';

/** The Admin page's list of pilots, and what an admin may change about one. */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    private readonly settings: SettingsFacade,
  ) {}

  async list(viewer: AuthenticatedUser): Promise<AdminUserDto[]> {
    assertAdmin(viewer);

    const users = await this.users.findAll();
    return this.withStorage(viewer, users);
  }

  /**
   * An admin's status is left alone — the viewer's included — so the page can
   * never lock out the people it belongs to. Demoting an admin is a deliberate
   * database write, like promoting one. Their storage limit may be changed.
   */
  async update(
    viewer: AuthenticatedUser,
    id: string,
    input: UpdateAdminUserDto,
  ): Promise<AdminUserDto> {
    assertAdmin(viewer);

    const target = await this.users.findById(id);

    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (input.status !== undefined && target.role === Role.Admin) {
      throw new BadRequestException('An admin cannot be blocked or made read-only');
    }

    const updated = await this.users.updateAdminFields(id, {
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.storageQuotaBytes === undefined
        ? {}
        : { storageQuotaBytes: input.storageQuotaBytes }),
    });

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    const [dto] = await this.withStorage(viewer, [updated]);
    return dto;
  }

  /** One grouped query for the whole list's usage, and the default once. */
  private async withStorage(
    viewer: AuthenticatedUser,
    users: readonly UserEntity[],
  ): Promise<AdminUserDto[]> {
    const [used, fallback] = await Promise.all([
      this.users.storageUsedBy(users.map((user) => user.id)),
      this.settings.defaultStorageQuotaBytes(),
    ]);

    return users.map((user) =>
      toAdminUserDto(user, viewer.id, {
        usedBytes: used.get(user.id) ?? 0,
        limitBytes: storageLimit(user.storageQuotaBytes, fallback),
      }),
    );
  }
}
