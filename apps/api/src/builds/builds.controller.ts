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

import {
  type AuthenticatedUser,
  CurrentUser,
  CurrentViewer,
  Public,
  ZodValidationPipe,
} from '../common';
import { BuildsService } from './builds.service';

/**
 * Guarded by the global JwtAuthGuard. The two reads a public build page needs
 * — the Public list and one build — are `@Public()`, and answer a signed-out
 * visitor with only what is shared; every write still needs a signed-in owner.
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

  /**
   * Public builds other pilots shared. Declared before `:id`, which would
   * otherwise take "shared" as an id and refuse it as not a UUID.
   */
  @Get('shared')
  listShared(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(listBuildsQuerySchema)) query: ListBuildsQuery,
  ): Promise<BuildDto[]> {
    return this.builds.listShared(user.id, query);
  }

  /** Every Public build, for anyone. Declared before `:id` for the same reason as `shared`. */
  @Public()
  @Get('public')
  listPublic(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Query(new ZodValidationPipe(listBuildsQuerySchema)) query: ListBuildsQuery,
  ): Promise<BuildDto[]> {
    return this.builds.listPublic(viewer?.id ?? null, query);
  }

  /** One of yours, or one someone shared as Public or Unlisted — which a visitor may open too. */
  @Public()
  @Get(':id')
  getOne(
    @CurrentViewer() viewer: AuthenticatedUser | null,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BuildDto> {
    return this.builds.getOne(viewer?.id ?? null, id);
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
