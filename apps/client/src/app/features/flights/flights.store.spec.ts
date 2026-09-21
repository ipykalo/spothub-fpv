import { Injector, runInInjectionContext } from '@angular/core';
import type { FlightDto, SessionDto, UpdateFlightDto } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { FlightsApi } from './flights.api';
import { FlightsStore } from './flights.store';

/**
 * The logbook. Two rules earn their tests: one flight goes through its own
 * route while several go as one bulk change the server applies to all or to
 * none, and a deletion is re-read rather than patched — removing a flight can
 * split its outing in two or take it away, and only the server knows how the
 * rest regrouped.
 */
describe('FlightsStore', () => {
  const flight = (id: string, over: Partial<FlightDto> = {}): FlightDto => ({
    id,
    sessionId: 's1',
    buildId: null,
    buildName: null,
    batteryUnitId: null,
    batteryName: null,
    modelName: null,
    fileName: `${id}.csv`,
    startedAt: '2026-09-14T18:32:10.000Z',
    endedAt: '2026-09-14T18:34:13.000Z',
    timeRecorded: true,
    durationS: 123,
    sampleCount: 500,
    startVoltage: null,
    minVoltage: null,
    endVoltage: null,
    mahUsed: null,
    maxCurrentA: null,
    minLinkQuality: null,
    minRssiDbm: null,
    minSnrDb: null,
    minDownlinkQuality: null,
    maxTxPowerMw: null,
    avgThrottlePct: null,
    maxThrottlePct: null,
    minRadioVoltage: null,
    hasGps: false,
    distanceM: null,
    maxAltitudeM: null,
    maxSpeedKmh: null,
    maxHomeDistanceM: null,
    ...over,
  });

  const session = (id: string, flights: FlightDto[]): SessionDto => ({
    id,
    startedAt: '2026-09-14T18:32:10.000Z',
    endedAt: '2026-09-14T19:00:00.000Z',
    timeRecorded: true,
    flightCount: flights.length,
    totalDurationS: flights.reduce((sum, entry) => sum + entry.durationS, 0),
    flights,
  });

  class FakeApi {
    calls: string[] = [];
    bodies: unknown[] = [];
    sessionList: SessionDto[] = [
      session('s1', [flight('f1'), flight('f2')]),
      session('s2', [flight('f3', { sessionId: 's2' })]),
    ];
    listFails = false;

    sessions(): Observable<SessionDto[]> {
      this.calls.push('sessions');

      return this.listFails
        ? throwError(() => new Error('offline'))
        : of([...this.sessionList]);
    }

    updateFlight(id: string, body: UpdateFlightDto): Observable<FlightDto> {
      this.calls.push('updateFlight');
      this.bodies.push(body);

      return of(flight(id, { buildId: 'b1', buildName: 'Cinelog20' }));
    }

    updateFlights(body: { flightIds: string[] }): Observable<FlightDto[]> {
      this.calls.push('updateFlights');
      this.bodies.push(body);

      return of(
        body.flightIds.map((id) => flight(id, { buildId: 'b1', buildName: 'Cinelog20' })),
      );
    }

    removeFlight(): Observable<null> {
      this.calls.push('removeFlight');
      this.sessionList = [session('s1', [flight('f2')])];

      return of(null);
    }
  }

  let api: FakeApi;
  let store: FlightsStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: FlightsApi, useValue: api }],
    });

    store = runInInjectionContext(injector, () => new FlightsStore());
  });

  it('starts empty, and a pilot who has flown nothing is not an error', () => {
    expect(store.sessions()).toEqual([]);
    expect(store.flightTotal()).toBe(0);
    expect(store.isEmpty()).toBe(true);
    expect(store.error()).toBeNull();
  });

  describe('loading', () => {
    it('fills the outings and counts the flights across them', async () => {
      await store.load();

      expect(store.sessions()).toHaveLength(2);
      expect(store.flightTotal()).toBe(3);
      expect(store.isEmpty()).toBe(false);
    });

    it('says what went wrong rather than throwing at the page', async () => {
      api.listFails = true;

      await store.load();

      expect(store.error()).toBe('Could not load your flights.');
      expect(store.loading()).toBe(false);
    });
  });

  describe('assigning a build or a pack', () => {
    it('sends one flight through its own route', async () => {
      await store.load();

      await store.assign(['f1'], { buildId: 'b1' });

      expect(api.calls.at(-1)).toBe('updateFlight');
      expect(api.bodies.at(-1)).toEqual({ buildId: 'b1' });
    });

    it('sends several as one change, so the server applies all of them or none', async () => {
      await store.load();

      await store.assign(['f1', 'f3'], { buildId: 'b1' });

      expect(api.calls.at(-1)).toBe('updateFlights');
      expect(api.bodies.at(-1)).toEqual({ buildId: 'b1', flightIds: ['f1', 'f3'] });
    });

    it('replaces the flights that changed, wherever their outing is', async () => {
      await store.load();

      await store.assign(['f1', 'f3'], { buildId: 'b1' });

      expect(store.sessions()[0].flights.map((entry) => entry.buildName)).toEqual([
        'Cinelog20',
        null,
      ]);
      expect(store.sessions()[1].flights[0].buildName).toBe('Cinelog20');
    });

    it('leaves the outings themselves alone: a build says nothing about when it was flown', async () => {
      await store.load();

      await store.assign(['f1'], { buildId: 'b1' });

      expect(store.sessions().map((entry) => entry.id)).toEqual(['s1', 's2']);
      expect(store.flightTotal()).toBe(3);
    });
  });

  describe('deleting a flight', () => {
    it('re-reads the logbook, since the outings may have regrouped around it', async () => {
      await store.load();

      await store.removeFlight('f1');

      expect(api.calls).toEqual(['sessions', 'removeFlight', 'sessions']);
      expect(store.sessions()).toHaveLength(1);
      expect(store.flightTotal()).toBe(1);
    });
  });
});
