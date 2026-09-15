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
  type CreateDraftSpotDto,
  type CreateSpotDto,
  type SpotDto,
  type UpdateSpotDto,
  createDraftSpotSchema,
  createSpotSchema,
  updateSpotSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { SpotsService } from './spots.service';

/**
 * Places to fly. Guarded by the global JwtAuthGuard — no route here is
 * `@Public()`, and the owner comes from the verified token, never the payload.
 */
@Controller('spots')
export class SpotsController {
  constructor(private readonly spots: SpotsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<SpotDto[]> {
    return this.spots.list(user.id);
  }

  /**
   * Public spots other pilots shared. Declared before `:id`, which would
   * otherwise take "shared" as an id and refuse it as not a UUID.
   */
  @Get('shared')
  listShared(@CurrentUser() user: AuthenticatedUser): Promise<SpotDto[]> {
    return this.spots.listShared(user.id);
  }

  /** One of yours, or one someone shared as Public or Unlisted. */
  @Get(':id')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SpotDto> {
    return this.spots.getOne(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createSpotSchema)) body: CreateSpotDto,
  ): Promise<SpotDto> {
    return this.spots.create(user.id, body);
  }

  /** One tap at the field: a private draft at the device's GPS fix, filled in afterwards. */
  @Post('drafts')
  createDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDraftSpotSchema)) body: CreateDraftSpotDto,
  ): Promise<SpotDto> {
    return this.spots.createDraft(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSpotSchema)) body: UpdateSpotDto,
  ): Promise<SpotDto> {
    return this.spots.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.spots.remove(user.id, id);
  }
}
