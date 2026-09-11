import { type WritableSignal, signal } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

export interface GridSort<K extends string> {
  readonly key: K;
  readonly direction: SortDirection;
}

export interface SortOption<K extends string> {
  readonly key: K;
  readonly label: string;
  /**
   * The direction a first click sorts in. Dates and money read newest and
   * dearest first; names read A to Z.
   */
  readonly direction?: SortDirection;
}

export type SortValue = string | number | null | undefined;

/**
 * How one kind of row is searched and sorted. Written once per grid, next to
 * the component that renders it, rather than inline in a template.
 */
export interface GridSpec<T, K extends string> {
  /** Every piece of text the search box should find the row by. */
  readonly text: (row: T) => readonly (string | null | undefined)[];
  readonly sortBy: Readonly<Record<K, (row: T) => SortValue>>;
}

/**
 * The view state of one grid: what is typed in the search box, which filter
 * chip is on, and the sort.
 *
 * View state, not application state — nothing else in the app cares how a
 * list is sorted — so a presenter may own one without breaking the rule that
 * presenters hold no application state.
 */
export class GridState<K extends string, F = never> {
  readonly query = signal('');
  readonly filter = signal<F | null>(null);
  readonly sort: WritableSignal<GridSort<K>>;

  constructor(sort: GridSort<K>) {
    this.sort = signal(sort);
  }
}

/**
 * Rows narrowed by the search box and a filter, then sorted.
 *
 * Every word typed has to appear somewhere in the row, in any order, so
 * "velox 2306" finds "T-Motor Velox V2306". Empty values sort last in both
 * directions: a repair with no recorded cost is not the cheapest one.
 */
export function gridView<T, K extends string>(
  rows: readonly T[],
  spec: GridSpec<T, K>,
  query: string,
  sort: GridSort<K>,
  keep: (row: T) => boolean = () => true,
): readonly T[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);

  const matches = rows.filter((row) => {
    if (!keep(row)) {
      return false;
    }

    if (words.length === 0) {
      return true;
    }

    const haystack = spec.text(row).filter(Boolean).join(' ').toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  });

  const read = spec.sortBy[sort.key];
  const flip = sort.direction === 'asc' ? 1 : -1;

  return [...matches].sort((a, b) => compareValues(read(a), read(b), flip));
}

function isBlank(value: SortValue): boolean {
  return value === null || value === undefined || value === '';
}

function compareValues(a: SortValue, b: SortValue, flip: number): number {
  const aBlank = isBlank(a);
  const bBlank = isBlank(b);

  if (aBlank || bBlank) {
    if (aBlank === bBlank) {
      return 0;
    }

    return aBlank ? 1 : -1;
  }

  if (typeof a === 'number' && typeof b === 'number') {
    return (a - b) * flip;
  }

  // `numeric` so "#10" sorts after "#9", and dates in ISO form compare as text.
  return (
    String(a).localeCompare(String(b), undefined, {
      numeric: true,
      sensitivity: 'base',
    }) * flip
  );
}
