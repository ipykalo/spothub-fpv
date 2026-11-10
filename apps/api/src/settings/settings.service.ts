import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type AppSettingsDto, Role, type UpdateAppSettingsDto } from '@spothub/shared';

import type { AuthenticatedUser } from '../common';
import type { Env } from '../config';
import type { AppSettingsEntity, UpdateAppSettingsData } from './app-settings.entity';
import { SettingsRepository } from './abstract/settings.repository';
import { toAppSettingsDto } from './settings.mapper';

/**
 * The app's settings: read by anyone's sign-in, changed only by an admin.
 *
 * The row starts from `OPEN_REGISTRATION` and `ALLOWED_EMAILS`, read once,
 * when it is first created. From then on the Admin page is where they change,
 * and the environment's values are only the starting point of a fresh
 * database.
 */
@Injectable()
export class SettingsService {
  private readonly initial: UpdateAppSettingsData;

  constructor(
    private readonly settings: SettingsRepository,
    config: ConfigService<Env, true>,
  ) {
    this.initial = {
      openRegistration: config.get('OPEN_REGISTRATION', { infer: true }),
      // "*" was once how sign-up was opened; on the list it would only be an
      // address nobody has.
      allowedEmails: config
        .get('ALLOWED_EMAILS', { infer: true })
        .filter((email) => email !== '*'),
    };
  }

  current(): Promise<AppSettingsEntity> {
    return this.settings.findOrCreate(this.initial);
  }

  async read(user: AuthenticatedUser): Promise<AppSettingsDto> {
    assertAdmin(user);
    return toAppSettingsDto(await this.current());
  }

  async update(
    user: AuthenticatedUser,
    input: UpdateAppSettingsDto,
  ): Promise<AppSettingsDto> {
    assertAdmin(user);

    const data: UpdateAppSettingsData = {
      ...(input.openRegistration === undefined
        ? {}
        : { openRegistration: input.openRegistration }),
      ...(input.allowedEmails === undefined
        ? {}
        : { allowedEmails: input.allowedEmails }),
    };

    return toAppSettingsDto(await this.settings.update(this.initial, data));
  }
}

/**
 * 403 rather than 404: the route's existence is no secret, and a signed-in
 * pilot who opens it should be told plainly that it is not theirs.
 */
function assertAdmin(user: AuthenticatedUser): void {
  if (user.role !== Role.Admin) {
    throw new ForbiddenException('Only an admin can change the settings');
  }
}
