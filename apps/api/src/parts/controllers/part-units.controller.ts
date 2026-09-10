import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  type CreatePartUnitDto,
  type PartUnitDto,
  type UpdatePartUnitDto,
  createPartUnitSchema,
  updatePartUnitSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { PartUnitsService } from '../services/part-units.service';

/**
 * Nested under a part, because a unit is one physical instance of a kind and
 * means nothing on its own. Guarded by the global JwtAuthGuard.
 */
@Controller('parts/:partId/units')
export class PartUnitsController {
  constructor(private readonly units: PartUnitsService) {}

  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Body(new ZodValidationPipe(createPartUnitSchema)) body: CreatePartUnitDto,
  ): Promise<PartUnitDto> {
    return this.units.add(user.id, partId, body);
  }

  @Patch(':unitId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body(new ZodValidationPipe(updatePartUnitSchema)) body: UpdatePartUnitDto,
  ): Promise<PartUnitDto> {
    return this.units.update(user.id, partId, unitId, body);
  }

  @Delete(':unitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ): Promise<void> {
    return this.units.remove(user.id, partId, unitId);
  }
}
