/**
 * The flights module's public API: the module, the facade `flight-logs`
 * stores flights through, and the shape of a flight on its way in.
 */
export { FlightsFacade } from './abstract/flights.facade';
export type { FlightFigures, NewFlightData } from './flight.entity';
export { FlightsModule } from './flights.module';
