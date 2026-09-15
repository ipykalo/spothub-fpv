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
  type CreateSpotDto,
  type SpotDto,
  type UpdateSpotDto,
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
