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
} from '@nestjs/common';
import {
  type FlightDto,
  type SessionDto,
  type UpdateFlightDto,
  updateFlightSchema,
} from '@spothub/shared';

import { type AuthenticatedUser, CurrentUser, ZodValidationPipe } from '../../common';
import { FlightsService } from '../services/flights.service';

/** Flights once they are in. Guarded by the global JwtAuthGuard. */
@Controller('flights')
export class FlightsController {
  constructor(private readonly flights: FlightsService) {}

  /** Every outing, newest first, each with its flights. */
  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto[]> {
    return this.flights.sessions(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFlightSchema)) body: UpdateFlightDto,
  ): Promise<FlightDto> {
    return this.flights.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.flights.remove(user.id, id);
  }
}
