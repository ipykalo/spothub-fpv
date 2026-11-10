import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type AdminUserDto, Role, type UpdateAdminUserDto } from '@spothub/shared';

import { type AuthenticatedUser, assertAdmin } from '../common';
import { UsersRepository } from './abstract/users.repository';
import { toAdminUserDto } from './users.mapper';

/** The Admin page's list of pilots, and what an admin may change about one. */
@Injectable()
export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async list(viewer: AuthenticatedUser): Promise<AdminUserDto[]> {
    assertAdmin(viewer);

    const users = await this.users.findAll();
    return users.map((user) => toAdminUserDto(user, viewer.id));
  }

  /**
   * Admins are left alone — the viewer included — so the page can never lock
   * out the people it belongs to. Demoting an admin is a deliberate database
   * write, like promoting one.
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

    if (target.role === Role.Admin) {
      throw new BadRequestException('An admin cannot be blocked or made read-only');
    }

    const updated = await this.users.setStatus(id, input.status);

    if (!updated) {
      throw new NotFoundException('User not found');
    }

    return toAdminUserDto(updated, viewer.id);
  }
}
