import { Injectable, computed, inject, signal } from '@angular/core';
import type { SessionDto, UpdateFlightDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { FlightsApi } from './flights.api';

/**
 * Signal-backed state for the logbook: the sessions and their flights.
 *
 * Getting logs in is `FlightLogsStore`'s job; a page that shows both reloads
 * this store once an import is over.
 */
@Injectable({ providedIn: 'root' })
export class FlightsStore {
  private readonly api = inject(FlightsApi);

  private readonly items = signal<readonly SessionDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly sessions = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  readonly isEmpty = computed(() => !this.busy() && this.items().length === 0);

  readonly flightTotal = computed(() =>
    this.items().reduce((sum, session) => sum + session.flightCount, 0),
  );

  async load(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.sessions()));
    } catch {
      this.failure.set('Could not load your flights.');
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Sets a build or battery pack on some flights. One flight goes through its
   * own route; several go as one bulk change, which the server applies to all
   * of them or to none.
   */
  async assign(flightIds: readonly string[], change: UpdateFlightDto): Promise<void> {
    const updated =
      flightIds.length === 1
        ? [await firstValueFrom(this.api.updateFlight(flightIds[0], change))]
        : await firstValueFrom(this.api.updateFlights({ ...change, flightIds: [...flightIds] }));

    const byId = new Map(updated.map((flight) => [flight.id, flight]));

    this.items.update((sessions) =>
      sessions.map((session) => ({
        ...session,
        flights: session.flights.map((flight) => byId.get(flight.id) ?? flight),
      })),
    );
  }

  /**
   * Re-read rather than patched: deleting a flight can split its session in
   * two, or remove it, and only the server knows how the rest regrouped.
   */
  async removeFlight(flightId: string): Promise<void> {
    await firstValueFrom(this.api.removeFlight(flightId));
    await this.load();
  }
}
