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
  type CreatePartSourceDto,
  type PartSourceDto,
  type UpdatePartSourceDto,
  createPartSourceSchema,
  updatePartSourceSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { PartSourcesService } from '../services/part-sources.service';

/**
 * Nested under a part, because a price is a price *of* something. Guarded by
 * the global JwtAuthGuard.
 */
@Controller('parts/:partId/sources')
export class PartSourcesController {
  constructor(private readonly sources: PartSourcesService) {}

  @Post()
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Body(new ZodValidationPipe(createPartSourceSchema)) body: CreatePartSourceDto,
  ): Promise<PartSourceDto> {
    return this.sources.add(user.id, partId, body);
  }

  @Patch(':sourceId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
    @Body(new ZodValidationPipe(updatePartSourceSchema)) body: UpdatePartSourceDto,
  ): Promise<PartSourceDto> {
    return this.sources.update(user.id, partId, sourceId, body);
  }

  @Delete(':sourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('partId', ParseUUIDPipe) partId: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
  ): Promise<void> {
    return this.sources.remove(user.id, partId, sourceId);
  }
}
