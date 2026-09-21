import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type FlightTimelineDto,
  type FlightTrackDto,
  type CreateLogImportDto,
  type KnownLogsDto,
  type KnownLogsResultDto,
  type LogImportDto,
  type LogUploadTicketDto,
  type RequestLogUploadDto,
  createLogImportSchema,
  knownLogsSchema,
  requestLogUploadSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../common';
import { FlightLogsService } from './flight-logs.service';

/**
 * Getting logs in. Guarded by the global JwtAuthGuard.
 *
 * No route here accepts a file body: logs go straight to storage on a
 * presigned PUT, and the import itself runs in the background — `POST
 * /imports` answers 202 and the client polls `GET /imports/:id`.
 */
@Controller('flight-logs')
export class FlightLogsController {
  constructor(private readonly logs: FlightLogsService) {}

  @Post('known')
  @HttpCode(HttpStatus.OK)
  known(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(knownLogsSchema)) body: KnownLogsDto,
  ): Promise<KnownLogsResultDto> {
    return this.logs.known(user.id, body);
  }

  @Post('uploads')
  @HttpCode(HttpStatus.OK)
  requestUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestLogUploadSchema)) body: RequestLogUploadDto,
  ): Promise<LogUploadTicketDto> {
    return this.logs.requestUpload(user.id, body);
  }

  @Post('imports')
  @HttpCode(HttpStatus.ACCEPTED)
  startImport(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createLogImportSchema)) body: CreateLogImportDto,
  ): Promise<LogImportDto> {
    return this.logs.startImport(user.id, body);
  }

  /**
   * A flight's path, for the map. Under this module because the track is read
   * out of the log file it arrived in, which is this module's to parse.
   */
  @Get('tracks/:flightId')
  track(
    @CurrentUser() user: AuthenticatedUser,
    @Param('flightId', ParseUUIDPipe) flightId: string,
  ): Promise<FlightTrackDto> {
    return this.logs.track(user.id, flightId);
  }

  /** What the pack, the sticks and the link did during one flight. */
  @Get('timelines/:flightId')
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('flightId', ParseUUIDPipe) flightId: string,
  ): Promise<FlightTimelineDto> {
    return this.logs.timeline(user.id, flightId);
  }

  @Get('imports/:id')
  getImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LogImportDto> {
    return this.logs.getImport(user.id, id);
  }
}
