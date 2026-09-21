import { describe, expect, it } from 'vitest';

import { GridState, type GridSpec, gridView } from './grid-view';

interface Row {
  readonly name: string;
  readonly maker: string | null;
  readonly price: number | null;
  readonly bought: string | null;
}

const SPEC: GridSpec<Row, 'name' | 'price' | 'bought'> = {
  text: (row) => [row.name, row.maker],
  sortBy: {
    name: (row) => row.name,
    price: (row) => row.price,
    bought: (row) => row.bought,
  },
};

const row = (
  name: string,
  maker: string | null = null,
  price: number | null = null,
  bought: string | null = null,
): Row => ({ name, maker, price, bought });

const names = (rows: readonly Row[]): string[] => rows.map((entry) => entry.name);

/**
 * The one place every list in the app is searched and sorted. Worth holding
 * down because the rules are easy to get subtly wrong: words in any order,
 * and a row with nothing recorded is not the cheapest one.
 */
describe('gridView', () => {
  const rows = [
    row('Velox V2306', 'T-Motor', 21, '2026-02-01'),
    row('Nazgul 5', 'iFlight', 9, '2026-01-01'),
    row('Unnamed', null, null, null),
  ];

  it('keeps every row when nothing is typed', () => {
    const shown = gridView(rows, SPEC, '', { key: 'name', direction: 'asc' });

    expect(shown).toHaveLength(3);
  });

  it('finds a row by words in any order, and ignores case', () => {
    const shown = gridView(rows, SPEC, 'velox t-motor', {
      key: 'name',
      direction: 'asc',
    });

    expect(names(shown)).toEqual(['Velox V2306']);
    expect(
      names(gridView(rows, SPEC, 'VELOX', { key: 'name', direction: 'asc' })),
    ).toEqual(['Velox V2306']);
  });

  it('needs every word to appear somewhere in the row', () => {
    const shown = gridView(rows, SPEC, 'velox iflight', {
      key: 'name',
      direction: 'asc',
    });

    expect(shown).toEqual([]);
  });

  it('searches the pieces the spec names, not the whole row', () => {
    // The price is not searchable text, so its digits find nothing.
    expect(gridView(rows, SPEC, '21', { key: 'name', direction: 'asc' })).toEqual([]);
  });

  it('applies the caller’s own filter as well as the search', () => {
    const shown = gridView(
      rows,
      SPEC,
      '',
      { key: 'name', direction: 'asc' },
      (entry) => entry.maker === 'iFlight',
    );

    expect(names(shown)).toEqual(['Nazgul 5']);
  });

  it('sorts numbers as numbers, in both directions', () => {
    const ascending = gridView(rows, SPEC, '', { key: 'price', direction: 'asc' });
    const descending = gridView(rows, SPEC, '', { key: 'price', direction: 'desc' });

    expect(names(ascending).slice(0, 2)).toEqual(['Nazgul 5', 'Velox V2306']);
    expect(names(descending).slice(0, 2)).toEqual(['Velox V2306', 'Nazgul 5']);
  });

  it('sorts what is missing last, whichever way the sort runs', () => {
    const ascending = gridView(rows, SPEC, '', { key: 'price', direction: 'asc' });
    const descending = gridView(rows, SPEC, '', { key: 'price', direction: 'desc' });

    // A repair with no recorded cost is not the cheapest one, nor the dearest.
    expect(names(ascending).at(-1)).toBe('Unnamed');
    expect(names(descending).at(-1)).toBe('Unnamed');
  });

  it('reads numbers inside text, so #10 comes after #9', () => {
    const numbered = [row('#10'), row('#9'), row('#1')];

    const shown = gridView(numbered, SPEC, '', { key: 'name', direction: 'asc' });

    expect(names(shown)).toEqual(['#1', '#9', '#10']);
  });

  it('leaves the rows it was given alone', () => {
    const original = [...rows];

    gridView(rows, SPEC, '', { key: 'price', direction: 'desc' });

    expect(rows).toEqual(original);
  });
});

describe('GridState', () => {
  it('starts empty, with the sort it was given', () => {
    const state = new GridState<'name'>({ key: 'name', direction: 'desc' });

    expect(state.query()).toBe('');
    expect(state.filter()).toBeNull();
    expect(state.sort()).toEqual({ key: 'name', direction: 'desc' });
  });

  it('holds what the toolbar puts in it', () => {
    const state = new GridState<'name', string>({ key: 'name', direction: 'asc' });

    state.query.set('velox');
    state.filter.set('BATTERY');
    state.sort.set({ key: 'name', direction: 'desc' });

    expect(state.query()).toBe('velox');
    expect(state.filter()).toBe('BATTERY');
    expect(state.sort().direction).toBe('desc');
  });
});
