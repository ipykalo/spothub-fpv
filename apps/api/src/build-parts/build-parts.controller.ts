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
  type BuildCostDto,
  type BuildPartDto,
  type InstallPartDto,
  type LinkInstallDto,
  type ListBuildPartsQuery,
  type RemoveInstallDto,
  installPartSchema,
  linkInstallSchema,
  listBuildPartsQuerySchema,
  removeInstallSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
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
   * Blames an existing install on a repair, or clears it with null.
   *
   * A patch on the install, because the `repairId` column is the install's.
   * It used to live under the repairs route, which read well but put the write
   * in a module that does not own the row.
   */
  @Patch(':installId')
  @HttpCode(HttpStatus.NO_CONTENT)
  linkRepair(
    @CurrentUser() user: AuthenticatedUser,
    @Param('buildId', ParseUUIDPipe) buildId: string,
    @Param('installId', ParseUUIDPipe) installId: string,
    @Body(new ZodValidationPipe(linkInstallSchema)) body: LinkInstallDto,
  ): Promise<void> {
    return this.installs.linkRepair(user.id, buildId, installId, body);
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
