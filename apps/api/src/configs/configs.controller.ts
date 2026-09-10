import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type ConfigDto,
  type ConfigWithRawDto,
  type CreateConfigDto,
  type UpdateConfigDto,
  createConfigSchema,
  updateConfigSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { ConfigsService } from './configs.service';

/**
 * Nested under a build: a firmware capture belongs to the quad it came off.
 * Guarded by the global JwtAuthGuard like everything else.
 */
@Controller('builds/:buildId/configs')
export class ConfigsController {
  constructor(private readonly configs: ConfigsService) {}

  /** Without the CLI text — see the single-capture route for that. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<ConfigDto[]> {
    return this.configs.list(user.id, buildId);
  }

  @Get(':configId')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
  ): Promise<ConfigWithRawDto> {
    return this.configs.getOne(user.id, buildId, configId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(createConfigSchema)) body: CreateConfigDto,
  ): Promise<ConfigWithRawDto> {
    return this.configs.create(user.id, buildId, body);
  }

  @Patch(':configId')
  updateNote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
    @Body(new ZodValidationPipe(updateConfigSchema)) body: UpdateConfigDto,
  ): Promise<ConfigDto> {
    return this.configs.updateNote(user.id, buildId, configId, body);
  }

  @Delete(':configId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('configId', ParseUUIDPipe) configId: string,
  ): Promise<void> {
    return this.configs.remove(user.id, buildId, configId);
  }
}
