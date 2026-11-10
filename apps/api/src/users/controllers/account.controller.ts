import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  type PilotNameDto,
  type StorageUsageDto,
  type UpdatePilotNameDto,
  updatePilotNameSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { UsersFacade } from '../abstract/users.facade';
import { UsersService } from '../users.service';

/** The signed-in pilot's own account. */
@Controller('users/me')
export class AccountController {
  constructor(
    private readonly users: UsersFacade,
    private readonly service: UsersService,
  ) {}

  /** How much of their storage they have used, for the account page. */
  @Get('storage')
  storage(@CurrentUser() user: AuthenticatedUser): Promise<StorageUsageDto> {
    return this.users.storageUsage(user.id);
  }

  /** The name they go by on the site; null goes back to the short form of their Google name. */
  @Patch('name')
  setPilotName(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePilotNameSchema)) body: UpdatePilotNameDto,
  ): Promise<PilotNameDto> {
    return this.service.setPilotName(user.id, body);
  }
}
