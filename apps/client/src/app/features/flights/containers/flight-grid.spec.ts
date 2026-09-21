import type { FlightDto, SessionDto } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { FLIGHT_GRID, flownBuildOptions, flownOnBuild } from './flight-grid';

/**
 * How the logbook is searched, sorted and filtered.
 *
 * The build filter is the part with a real trap in it: "flights on no build"
 * has to be its own chip, because `sh-filter-chips` already reserves `null`
 * to mean "All" — so a sentinel stands in for it, and the two must never be
 * confused. The chips also come from the flights themselves, so a build that
 * has never been flown does not offer a filter that would show nothing.
 */
describe('the logbook grid', () => {
  const flight = (id: string, over: Partial<FlightDto> = {}): FlightDto =>
    ({
      id,
      sessionId: 's1',
      buildId: null,
      buildName: null,
      batteryName: null,
      modelName: null,
      fileName: `${id}.csv`,
      startedAt: '2026-09-14T18:32:10.000Z',
      durationS: 120,
      minVoltage: null,
      minLinkQuality: null,
      ...over,
    }) as FlightDto;

  const session = (flights: FlightDto[]): SessionDto => ({ flights }) as SessionDto;

  describe('what the search box matches', () => {
    it('is the build, the pack, the radio model and the file it came in', () => {
      const text = FLIGHT_GRID.text(
        flight('f1', {
          buildName: 'Cinelog20',
          batteryName: 'Tattu 6S #3',
          modelName: 'Cinelog 20',
          fileName: 'btfl_001.bbl',
        }),
      );

      expect(text).toEqual(['Cinelog20', 'Tattu 6S #3', 'Cinelog 20', 'btfl_001.bbl']);
    });

    it('leaves out what a flight has not been assigned, rather than inventing it', () => {
      expect(FLIGHT_GRID.text(flight('f1'))).toEqual([null, null, null, 'f1.csv']);
    });
  });

  describe('what each sort reads', () => {
    it('is the flight’s own figure, and null where the log had no sensor', () => {
      const one = flight('f1', { durationS: 300, minVoltage: 14.2, minLinkQuality: 88 });

      expect(FLIGHT_GRID.sortBy.date(one)).toBe('2026-09-14T18:32:10.000Z');
      expect(FLIGHT_GRID.sortBy.duration(one)).toBe(300);
      expect(FLIGHT_GRID.sortBy.voltage(one)).toBe(14.2);
      expect(FLIGHT_GRID.sortBy.link(one)).toBe(88);
      expect(FLIGHT_GRID.sortBy.voltage(flight('f2'))).toBeNull();
    });
  });

  describe('the build chips', () => {
    it('offers only the builds actually flown, by name, in alphabetical order', () => {
      const options = flownBuildOptions([
        session([
          flight('f1', { buildId: 'b2', buildName: 'Nazgul' }),
          flight('f2', { buildId: 'b1', buildName: 'Cinelog20' }),
        ]),
        session([flight('f3', { buildId: 'b2', buildName: 'Nazgul' })]),
      ]);

      expect(options).toEqual([
        { value: 'b1', label: 'Cinelog20' },
        { value: 'b2', label: 'Nazgul' },
      ]);
    });

    it('adds a chip for flights on no build, and only when there are some', () => {
      const withUnassigned = flownBuildOptions([
        session([flight('f1', { buildId: 'b1', buildName: 'Cinelog20' }), flight('f2')]),
      ]);
      const without = flownBuildOptions([
        session([flight('f1', { buildId: 'b1', buildName: 'Cinelog20' })]),
      ]);

      expect(withUnassigned.at(-1)?.label).toBe('No build');
      expect(without.map((option) => option.label)).toEqual(['Cinelog20']);
    });

    it('falls back to the id for a build whose name never came through', () => {
      const options = flownBuildOptions([
        session([flight('f1', { buildId: 'b1', buildName: null })]),
      ]);

      expect(options).toEqual([{ value: 'b1', label: 'b1' }]);
    });

    it('has nothing to offer for an empty logbook', () => {
      expect(flownBuildOptions([])).toEqual([]);
    });
  });

  describe('the build filter', () => {
    const onCinelog = flight('f1', { buildId: 'b1', buildName: 'Cinelog20' });
    const onNothing = flight('f2');

    it('lets every flight through when nothing is chosen', () => {
      expect(flownOnBuild(onCinelog, null)).toBe(true);
      expect(flownOnBuild(onNothing, null)).toBe(true);
    });

    it('keeps the flights on the chosen build', () => {
      expect(flownOnBuild(onCinelog, 'b1')).toBe(true);
      expect(flownOnBuild(onNothing, 'b1')).toBe(false);
    });

    it('keeps the ones on no build when that chip is chosen', () => {
      const noBuild = flownBuildOptions([session([onCinelog, onNothing])]).at(-1);

      expect(flownOnBuild(onNothing, noBuild?.value ?? '')).toBe(true);
      expect(flownOnBuild(onCinelog, noBuild?.value ?? '')).toBe(false);
    });
  });
});
