import { describe, expect, it } from 'vitest';

import { stableSigning } from './stable-signing';

const HOUR = 3600;
const at = (iso: string): number => Date.parse(iso);

describe('stableSigning', () => {
  it('signs everything in one quarter-hour window as at its start, so the address stays the same', () => {
    const early = stableSigning(at('2026-11-11T10:00:05Z'), HOUR);
    const late = stableSigning(at('2026-11-11T10:14:59Z'), HOUR);

    expect(early).toEqual(late);
    expect(early.signedAt.toISOString()).toBe('2026-11-11T10:00:00.000Z');
  });

  it('moves on with the next window', () => {
    expect(stableSigning(at('2026-11-11T10:15:00Z'), HOUR).signedAt.toISOString()).toBe(
      '2026-11-11T10:15:00.000Z',
    );
  });

  it('always leaves an address 45 minutes of an hour, and lets the browser keep it that long', () => {
    for (let second = 0; second < 2 * HOUR; second += 37) {
      const now = at('2026-11-11T10:00:00Z') + second * 1000;
      const { signedAt, cacheSeconds } = stableSigning(now, HOUR);
      const leftSeconds = (signedAt.getTime() + HOUR * 1000 - now) / 1000;

      expect(cacheSeconds).toBe((3 * HOUR) / 4);
      expect(leftSeconds).toBeGreaterThanOrEqual(cacheSeconds);
    }
  });
});
