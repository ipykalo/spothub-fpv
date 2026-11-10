import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  type AppSettingsDto,
  type UpdateAppSettingsDto,
  updateAppSettingsSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { SettingsService } from './settings.service';

/**
 * The Admin page's settings. Signed-in like every route; whether the caller
 * is an admin is the service's to decide, by role.
 */
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  read(@CurrentUser() user: AuthenticatedUser): Promise<AppSettingsDto> {
    return this.settings.read(user);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateAppSettingsSchema)) body: UpdateAppSettingsDto,
  ): Promise<AppSettingsDto> {
    return this.settings.update(user, body);
  }
}
