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
  type BuildDto,
  type CreateBuildDto,
  type ListBuildsQuery,
  type UpdateBuildDto,
  createBuildSchema,
  listBuildsQuerySchema,
  updateBuildSchema,
} from '@spothub/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BuildsService } from './builds.service';

/**
 * Guarded by the global JwtAuthGuard — no route here is `@Public()`.
 *
 * The owner id comes from the verified token, never from the payload, so a
 * client cannot ask for someone else's builds.
 */
@Controller('builds')
export class BuildsController {
  constructor(private readonly builds: BuildsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    // Scoped to the query rather than the method: a method-level pipe runs the
    // schema over every parameter, which silently strips anything it does not
    // declare and breaks outright on a non-object one.
    @Query(new ZodValidationPipe(listBuildsQuerySchema)) query: ListBuildsQuery,
  ): Promise<BuildDto[]> {
    return this.builds.list(user.id, query);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BuildDto> {
    return this.builds.getOne(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createBuildSchema)) body: CreateBuildDto,
  ): Promise<BuildDto> {
    return this.builds.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBuildSchema)) body: UpdateBuildDto,
  ): Promise<BuildDto> {
    return this.builds.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.builds.remove(user.id, id);
  }
}
