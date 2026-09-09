import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type BuildCostDto,
  type BuildPartDto,
  type InstallPartDto,
  type ListBuildPartsQuery,
  type RemoveInstallDto,
  installPartSchema,
  listBuildPartsQuerySchema,
  removeInstallSchema,
} from '@spothub/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { BuildPartsService } from './build-parts.service';

/**
 * Nested under a build, because an installation only means anything in the
 * context of one. Guarded by the global JwtAuthGuard like everything else.
 */
@Controller('builds/:buildId/parts')
export class BuildPartsController {
  constructor(private readonly installs: BuildPartsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    // Scoped to the query, not the method. A method-level @UsePipes runs the
    // schema over *every* parameter, and this handler also takes a `buildId`
    // string -- an object schema rejects that outright, so the whole route
    // answered 400 before it reached the service.
    @Query(new ZodValidationPipe(listBuildPartsQuerySchema)) query: ListBuildPartsQuery,
  ): Promise<BuildPartDto[]> {
    return this.installs.list(user.id, buildId, query);
  }

  @Get('cost')
  cost(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
  ): Promise<BuildCostDto> {
    return this.installs.cost(user.id, buildId);
  }

  @Post()
  install(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Body(new ZodValidationPipe(installPartSchema)) body: InstallPartDto,
  ): Promise<BuildPartDto> {
    return this.installs.install(user.id, buildId, body);
  }

  /**
   * A DELETE that records an end date rather than dropping the row: the
   * history is the reason the table exists. It answers with the closed
   * install, so the client can show when it came off.
   */
  @Delete(':installId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('installId', ParseUUIDPipe) installId: string,
    @Body(new ZodValidationPipe(removeInstallSchema)) body: RemoveInstallDto,
  ): Promise<BuildPartDto> {
    return this.installs.remove(user.id, buildId, installId, body);
  }
}
