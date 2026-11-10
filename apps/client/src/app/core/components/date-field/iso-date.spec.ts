import { describe, expect, it } from 'vitest';

import { fromIsoDate, localToday, toIsoDate } from './iso-date';

describe('iso dates', () => {
  it('writes a local date as its calendar day, padded', () => {
    expect(toIsoDate(new Date(2026, 3, 1))).toBe('2026-04-01');
    expect(toIsoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('keeps the local day just after midnight, where UTC would say yesterday', () => {
    expect(toIsoDate(new Date(2026, 10, 10, 0, 30))).toBe('2026-11-10');
  });

  it('reads a calendar day back as local midnight', () => {
    const date = fromIsoDate('2026-04-01');

    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(3);
    expect(date?.getDate()).toBe(1);
    expect(date?.getHours()).toBe(0);
  });

  it('reads nothing from an empty field, a malformed one or a day that does not exist', () => {
    expect(fromIsoDate('')).toBeNull();
    expect(fromIsoDate(null)).toBeNull();
    expect(fromIsoDate(undefined)).toBeNull();
    expect(fromIsoDate('04/01/2026')).toBeNull();
    expect(fromIsoDate('2026-02-31')).toBeNull();
  });

  it('round-trips', () => {
    expect(toIsoDate(fromIsoDate('2024-02-29') ?? new Date(0))).toBe('2024-02-29');
  });

  it('gives today as a calendar day', () => {
    expect(localToday()).toBe(toIsoDate(new Date()));
  });
});
