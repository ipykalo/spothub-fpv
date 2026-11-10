import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import {
  type AdminUserDto,
  type UpdateAdminUserDto,
  updateAdminUserSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { UsersService } from './users.service';

/** The Admin page's pilots. Admins only, checked by role in the service. */
@Controller('admin/users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(@CurrentUser() viewer: AuthenticatedUser): Promise<AdminUserDto[]> {
    return this.users.list(viewer);
  }

  @Patch(':id')
  update(
    @CurrentUser() viewer: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAdminUserSchema)) body: UpdateAdminUserDto,
  ): Promise<AdminUserDto> {
    return this.users.update(viewer, id, body);
  }
}
