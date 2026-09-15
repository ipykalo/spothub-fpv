import { describe, expect, it } from 'vitest';

import { type PlannedFlight, planSessions } from './session-planner';

const GAP = 90 * 60_000;

/** A flight from `from` to `to`, in minutes after 10:00. */
function flight(
  key: string,
  from: number,
  to: number,
  sessionId: string | null = null,
): PlannedFlight {
  const at = (minutes: number): Date => new Date(Date.UTC(2026, 8, 12, 10, minutes));
  return { key, startedAt: at(from), endedAt: at(to), sessionId };
}

describe('planSessions', () => {
  it('starts a new outing after a gap longer than 90 minutes', () => {
    const plan = planSessions(
      [flight('a', 0, 5), flight('b', 20, 25), flight('c', 200, 205)],
      GAP,
    );

    expect(plan.sessions.map((session) => session.keys)).toEqual([['a', 'b'], ['c']]);
    expect(plan.sessions.every((session) => session.sessionId === null)).toBe(true);
    expect(plan.dropped).toEqual([]);
  });

  it('keeps an existing session when new flights join it', () => {
    const plan = planSessions([flight('a', 0, 5, 's1'), flight('new', 30, 35)], GAP);

    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0].sessionId).toBe('s1');
    expect(plan.sessions[0].endedAt.toISOString()).toBe('2026-09-12T10:35:00.000Z');
  });

  it('merges two sessions a new flight has bridged, and drops the later one', () => {
    const plan = planSessions(
      [flight('a', 0, 5, 's1'), flight('b', 150, 155, 's2'), flight('new', 80, 85)],
      GAP,
    );

    expect(plan.sessions).toHaveLength(1);
    expect(plan.sessions[0].sessionId).toBe('s1');
    expect(plan.sessions[0].keys).toEqual(['a', 'new', 'b']);
    expect(plan.dropped).toEqual(['s2']);
  });

  it('splits a session whose middle flight was deleted: the earlier half keeps the id', () => {
    const plan = planSessions(
      [flight('a', 0, 5, 's1'), flight('c', 150, 155, 's1')],
      GAP,
    );

    expect(plan.sessions.map((session) => session.sessionId)).toEqual(['s1', null]);
    expect(plan.dropped).toEqual([]);
  });

  it('measures the gap from the latest landing, not the last take-off', () => {
    // A 60-minute flight, then a short one 100 minutes after it took off but
    // only 40 after it landed: one outing.
    const plan = planSessions([flight('long', 0, 60), flight('short', 100, 104)], GAP);

    expect(plan.sessions).toHaveLength(1);
  });
});
