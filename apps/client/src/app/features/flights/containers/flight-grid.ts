import type { FlightDto, SessionDto } from '@spothub/shared';

import type { ChoiceOption } from '../../../core/components/choice-option';
import type {
  GridSpec,
  SortOption,
} from '../../../core/components/grid-toolbar/grid-view';

/** How the logbook's search, sort and build filter read a flight. */

export type FlightSortKey = 'date' | 'duration' | 'voltage' | 'link';

/**
 * A filter value distinct from any real build id, so "flights on no build"
 * is its own chip rather than colliding with `sh-filter-chips`' own `null` —
 * which that component already reserves to mean "All".
 */
const UNASSIGNED_BUILD = '__unassigned__';

export const FLIGHT_GRID: GridSpec<FlightDto, FlightSortKey> = {
  text: (flight) => [
    flight.buildName,
    flight.batteryName,
    flight.modelName,
    flight.fileName,
  ],
  sortBy: {
    date: (flight) => flight.startedAt,
    duration: (flight) => flight.durationS,
    voltage: (flight) => flight.minVoltage,
    link: (flight) => flight.minLinkQuality,
  },
};

export const FLIGHT_SORTS: readonly SortOption<FlightSortKey>[] = [
  { key: 'date', label: 'Date' },
  { key: 'duration', label: 'Duration', direction: 'desc' },
  // Ascending by default: the worst reading first is what triage wants.
  { key: 'voltage', label: 'Min voltage' },
  { key: 'link', label: 'Link quality' },
];

/**
 * Only the builds actually flown, from the flights themselves — a build
 * with no logbook entries yet is not a useful filter chip — plus a "No build"
 * chip when at least one flight has no build at all. Reads `buildName`
 * straight off each flight, so this needs no builds store.
 */
export function flownBuildOptions(
  sessions: readonly SessionDto[],
): ChoiceOption<string>[] {
  const named = new Map<string, string>();
  let unassigned = false;

  for (const session of sessions) {
    for (const flight of session.flights) {
      if (flight.buildId === null) {
        unassigned = true;
      } else if (!named.has(flight.buildId)) {
        named.set(flight.buildId, flight.buildName ?? flight.buildId);
      }
    }
  }

  const options = [...named.entries()]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label }));

  return unassigned
    ? [...options, { value: UNASSIGNED_BUILD, label: 'No build' }]
    : options;
}

/** Whether a flight passes the build filter; null lets every flight through. */
export function flownOnBuild(flight: FlightDto, buildFilter: string | null): boolean {
  if (buildFilter === null) {
    return true;
  }

  return buildFilter === UNASSIGNED_BUILD
    ? flight.buildId === null
    : flight.buildId === buildFilter;
}
