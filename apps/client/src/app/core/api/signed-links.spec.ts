import { describe, expect, it } from 'vitest';

import {
  AWAY_BEFORE_REFRESH_MS,
  MIN_REFRESH_GAP_MS,
  RefreshGate,
  awayLongEnough,
} from './signed-links';

describe('awayLongEnough', () => {
  it('asks again after ten minutes away, and not after a glance at another tab', () => {
    expect(awayLongEnough(1_000, 1_000 + AWAY_BEFORE_REFRESH_MS)).toBe(true);
    expect(awayLongEnough(1_000, 1_000 + 60_000)).toBe(false);
  });

  it('does nothing for a tab that was never hidden', () => {
    expect(awayLongEnough(null, 10 * AWAY_BEFORE_REFRESH_MS)).toBe(false);
  });
});

describe('RefreshGate', () => {
  it('lets the first refresh through and holds the rest of a burst back', () => {
    const gate = new RefreshGate();

    expect(gate.allow(5_000)).toBe(true);
    expect(gate.allow(5_010)).toBe(false);
    expect(gate.allow(5_000 + MIN_REFRESH_GAP_MS - 1)).toBe(false);
  });

  it('opens again once the gap has passed', () => {
    const gate = new RefreshGate();
    gate.allow(5_000);

    expect(gate.allow(5_000 + MIN_REFRESH_GAP_MS)).toBe(true);
  });
});
