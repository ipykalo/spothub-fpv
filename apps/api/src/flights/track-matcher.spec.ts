import { describe, expect, it } from 'vitest';

import {
  type CandidateFlight,
  TRACK_SEARCH_WINDOW_MS,
  matchTrack,
} from './track-matcher';

const HOUR = 3_600_000;
const at = (iso: string): Date => new Date(iso);

function flight(id: string, from: string, to: string): CandidateFlight {
  return { id, startedAt: at(from), endedAt: at(to) };
}

/** The synthetic Air65 loop: the radio's clock, and the GPX's true UTC. */
const RADIO_FLIGHT = flight(
  'air65',
  '2026-09-14T18:32:10.000Z',
  '2026-09-14T18:34:12.800Z',
);
const GPX_TRACK = {
  startedAt: at('2026-09-14T16:32:13.000Z'),
  endedAt: at('2026-09-14T16:34:12.800Z'),
};

describe('matchTrack', () => {
  it('joins a flight whose times overlap the track as recorded', () => {
    const track = {
      startedAt: at('2026-09-14T18:32:13.000Z'),
      endedAt: at('2026-09-14T18:34:12.800Z'),
    };

    expect(matchTrack(track, [RADIO_FLIGHT])).toEqual({ flightId: 'air65', offsetMs: 0 });
  });

  it('finds a flight from a radio set to local time, two hours ahead of UTC', () => {
    expect(matchTrack(GPX_TRACK, [RADIO_FLIGHT])).toEqual({
      flightId: 'air65',
      offsetMs: 2 * HOUR,
    });
  });

  it('finds a flight from a radio behind UTC, and from a half-hour zone', () => {
    const newYork = flight('ny', '2026-09-14T12:32:10.000Z', '2026-09-14T12:34:12.800Z');
    const india = flight('in', '2026-09-14T22:02:10.000Z', '2026-09-14T22:04:12.800Z');

    expect(matchTrack(GPX_TRACK, [newYork])).toEqual({
      flightId: 'ny',
      offsetMs: -4 * HOUR,
    });
    expect(matchTrack(GPX_TRACK, [india])).toEqual({
      flightId: 'in',
      offsetMs: 5.5 * HOUR,
    });
  });

  it('prefers the time as recorded over a shifted one', () => {
    const recorded = flight(
      'same',
      '2026-09-14T16:32:05.000Z',
      '2026-09-14T16:34:20.000Z',
    );

    expect(matchTrack(GPX_TRACK, [RADIO_FLIGHT, recorded])).toEqual({
      flightId: 'same',
      offsetMs: 0,
    });
  });

  it('needs the landing to line up too, not only the take-off', () => {
    const longer = flight('long', '2026-09-14T18:32:10.000Z', '2026-09-14T18:40:00.000Z');

    expect(matchTrack(GPX_TRACK, [longer])).toBeNull();
  });

  it('refuses to guess between two flights that fit equally well', () => {
    const twin = flight('twin', '2026-09-14T18:32:20.000Z', '2026-09-14T18:34:20.000Z');

    expect(matchTrack(GPX_TRACK, [RADIO_FLIGHT, twin])).toBeNull();
  });

  it('matches nothing beyond the time zones in use', () => {
    const tooFar = flight('far', '2026-09-15T07:32:10.000Z', '2026-09-15T07:34:12.800Z');

    expect(matchTrack(GPX_TRACK, [tooFar])).toBeNull();
    expect(matchTrack(GPX_TRACK, [])).toBeNull();
  });

  it('searches far enough for the largest offset', () => {
    expect(TRACK_SEARCH_WINDOW_MS).toBeGreaterThanOrEqual(14 * HOUR);
  });
});
