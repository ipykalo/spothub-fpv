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
  type CreateRepairDto,
  type LinkInstallDto,
  type RepairDto,
  type UpdateRepairDto,
  createRepairSchema,
  linkInstallSchema,
  updateRepairSchema,
} from '@spothub/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RepairsService } from './repairs.service';

/**
 * Nested under a build: a repair only means anything in the context of the
 * thing that broke. Guarded by the global JwtAuthGuard like everything else.
 */
@Controller('builds/:buildId/repairs')
export class RepairsController {
  constructor(private readonly repairs: RepairsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<RepairDto[]> {
    return this.repairs.list(user.id, buildId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(createRepairSchema)) body: CreateRepairDto,
  ): Promise<RepairDto> {
    return this.repairs.create(user.id, buildId, body);
  }

  @Patch(':repairId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('repairId', ParseUUIDPipe) repairId: string,
    @Body(new ZodValidationPipe(updateRepairSchema)) body: UpdateRepairDto,
  ): Promise<RepairDto> {
    return this.repairs.update(user.id, buildId, repairId, body);
  }

  @Delete(':repairId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('repairId', ParseUUIDPipe) repairId: string,
  ): Promise<void> {
    return this.repairs.remove(user.id, buildId, repairId);
  }

  /**
   * Blames an existing install on a repair, or clears it with null.
   *
   * Sits here rather than on the install route because the interesting object
   * is the repair: this is what turns "a motor went on in March" into "that
   * crash cost me a motor".
   */
  @Patch('installs/:installId')
  @HttpCode(HttpStatus.NO_CONTENT)
  linkInstall(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('installId', ParseUUIDPipe) installId: string,
    @Body(new ZodValidationPipe(linkInstallSchema)) body: LinkInstallDto,
  ): Promise<void> {
    return this.repairs.linkInstall(user.id, buildId, installId, body);
  }
}
