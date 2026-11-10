import { Controller, Get } from '@nestjs/common';
import type { StorageUsageDto } from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser } from '../../common';
import { UsersFacade } from '../abstract/users.facade';

/** The signed-in pilot's own account. */
@Controller('users/me')
export class AccountController {
  constructor(private readonly users: UsersFacade) {}

  /** How much of their storage they have used, for the account page. */
  @Get('storage')
  storage(@CurrentUser() user: AuthenticatedUser): Promise<StorageUsageDto> {
    return this.users.storageUsage(user.id);
  }
}
