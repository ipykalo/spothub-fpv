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

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { FlightLogsService } from '../services/flight-logs.service';

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

  @Get('imports/:id')
  getImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LogImportDto> {
    return this.logs.getImport(user.id, id);
  }
}
