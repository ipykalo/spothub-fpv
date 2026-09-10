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
  type ListPartsQuery,
  type PartDto,
  type UpdatePartDto,
  createPartSchema,
  listPartsQuerySchema,
  updatePartSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { PartsService } from '../services/parts.service';

/**
 * Guarded by the global JwtAuthGuard — no route here is `@Public()`.
 *
 * The owner id comes from the verified token, never from the payload, so a
 * client cannot reach someone else's inventory.
 */
@Controller('parts')
export class PartsController {
  constructor(private readonly parts: PartsService) {}

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
}
