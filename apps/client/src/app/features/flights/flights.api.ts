import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  FlightDto,
  SessionDto,
  UpdateFlightDto,
  UpdateFlightsDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to FlightsStore. */
@Injectable({ providedIn: 'root' })
export class FlightsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  sessions(): Observable<SessionDto[]> {
    return this.http.get<SessionDto[]>(`${this.base}/flights/sessions`);
  }

  updateFlight(id: string, body: UpdateFlightDto): Observable<FlightDto> {
    return this.http.patch<FlightDto>(`${this.base}/flights/${id}`, body);
  }

  /** One build or battery pack on many flights; the server applies all or none. */
  updateFlights(body: UpdateFlightsDto): Observable<FlightDto[]> {
    return this.http.patch<FlightDto[]>(`${this.base}/flights`, body);
  }

  removeFlight(id: string): Observable<null> {
    return this.http.delete<null>(`${this.base}/flights/${id}`);
  }
}
