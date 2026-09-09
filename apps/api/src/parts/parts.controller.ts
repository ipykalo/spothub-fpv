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
  Query,
} from '@nestjs/common';
import {
  type CreatePartDto,
  type CreatePartSourceDto,
  type CreatePartUnitDto,
  type EnrichUrlDto,
  type ListPartsQuery,
  type PartDto,
  type PartSourceDto,
  type PartUnitDto,
  type UpdatePartDto,
  type UpdatePartSourceDto,
  type UpdatePartUnitDto,
  type UrlPreviewDto,
  createPartSchema,
  createPartSourceSchema,
  createPartUnitSchema,
  enrichUrlSchema,
  listPartsQuerySchema,
  updatePartSchema,
  updatePartSourceSchema,
  updatePartUnitSchema,
} from '@spothub/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PartsService } from './parts.service';
import { UrlPreviewService } from './url-preview.service';

/**
 * Guarded by the global JwtAuthGuard — no route here is `@Public()`.
 *
 * The owner id comes from the verified token, never from the payload, so a
 * client cannot reach someone else's inventory.
 */
@Controller('parts')
export class PartsController {
  constructor(
    private readonly parts: PartsService,
    private readonly preview: UrlPreviewService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    // Scoped to the query rather than the method: a method-level pipe runs the
    // schema over every parameter, which silently strips anything it does not
    // declare and breaks outright on a non-object one.
    @Query(new ZodValidationPipe(listPartsQuerySchema)) query: ListPartsQuery,
  ): Promise<PartDto[]> {
    return this.parts.list(user.id, query);
  }

  /**
   * Paste-a-URL enrichment. A POST rather than a GET because the URL is a
   * body, not a path — and it keeps the pasted link out of the access log.
   */
  @Post('url-preview')
  @HttpCode(HttpStatus.OK)
  urlPreview(
    @Body(new ZodValidationPipe(enrichUrlSchema)) body: EnrichUrlDto,
  ): Promise<UrlPreviewDto> {
    return this.preview.fetchPreview(body.url);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PartDto> {
    return this.parts.getOne(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPartSchema)) body: CreatePartDto,
  ): Promise<PartDto> {
    return this.parts.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePartSchema)) body: UpdatePartDto,
  ): Promise<PartDto> {
    return this.parts.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.parts.remove(user.id, id);
  }

  @Post(':id/units')
  addUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPartUnitSchema)) body: CreatePartUnitDto,
  ): Promise<PartUnitDto> {
    return this.parts.addUnit(user.id, id, body);
  }

  @Patch(':id/units/:unitId')
  updateUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body(new ZodValidationPipe(updatePartUnitSchema)) body: UpdatePartUnitDto,
  ): Promise<PartUnitDto> {
    return this.parts.updateUnit(user.id, id, unitId, body);
  }

  @Delete(':id/units/:unitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUnit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ): Promise<void> {
    return this.parts.removeUnit(user.id, id, unitId);
  }

  @Post(':id/sources')
  addSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createPartSourceSchema)) body: CreatePartSourceDto,
  ): Promise<PartSourceDto> {
    return this.parts.addSource(user.id, id, body);
  }

  @Patch(':id/sources/:sourceId')
  updateSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
    @Body(new ZodValidationPipe(updatePartSourceSchema)) body: UpdatePartSourceDto,
  ): Promise<PartSourceDto> {
    return this.parts.updateSource(user.id, id, sourceId, body);
  }

  @Delete(':id/sources/:sourceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSource(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
  ): Promise<void> {
    return this.parts.removeSource(user.id, id, sourceId);
  }
}
