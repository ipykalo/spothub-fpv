/**
 * Which flights share an outing, and which session row each outing keeps.
 *
 * Sessions are derived: flights closer together than the gap are one outing.
 * But a session is also a row other things will hang off in V2 — a spot, some
 * notes — so its id must survive a re-import. The plan therefore reuses an
 * existing session wherever a group already has one, merges sessions a new
 * flight has bridged, and drops the ones a merge or a deletion emptied.
 *
 * Pure: the repository loads the owner's flights, asks for a plan and applies
 * it in one transaction.
 */

export interface PlannedFlight {
  /** An existing flight's id, or a placeholder for one about to be inserted. */
  readonly key: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  /** The session it is in now; null for a flight not yet stored. */
  readonly sessionId: string | null;
}

export interface PlannedSession {
  /** The existing session this group keeps, or null to create one. */
  readonly sessionId: string | null;
  readonly keys: readonly string[];
  readonly startedAt: Date;
  readonly endedAt: Date;
}

export interface SessionPlan {
  readonly sessions: readonly PlannedSession[];
  /** Sessions no group kept — emptied by a merge — to delete. */
  readonly dropped: readonly string[];
}

export function planSessions(
  flights: readonly PlannedFlight[],
  gapMs: number,
): SessionPlan {
  const ordered = [...flights].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.key.localeCompare(b.key),
  );

  const groups: PlannedFlight[][] = [];
  let current: PlannedFlight[] = [];
  let currentEnd = 0;

  for (const flight of ordered) {
    // Measured from the latest landing so far, not the last take-off: a long
    // flight followed by a short one is still one outing.
    if (current.length > 0 && flight.startedAt.getTime() - currentEnd > gapMs) {
      groups.push(current);
      current = [];
      currentEnd = 0;
    }

    current.push(flight);
    currentEnd = Math.max(currentEnd, flight.endedAt.getTime());
  }

  if (current.length > 0) {
    groups.push(current);
  }

  const claimed = new Set<string>();

  const sessions = groups.map((members): PlannedSession => {
    // Earliest member first, so a split keeps its id on the earlier half and
    // the later half gets a new row. Each id goes to one group only.
    const kept =
      members
        .map((member) => member.sessionId)
        .find((id): id is string => id !== null && !claimed.has(id)) ?? null;

    if (kept !== null) {
      claimed.add(kept);
    }

    return {
      sessionId: kept,
      keys: members.map((member) => member.key),
      startedAt: new Date(Math.min(...members.map((m) => m.startedAt.getTime()))),
      endedAt: new Date(Math.max(...members.map((m) => m.endedAt.getTime()))),
    };
  });

  const existing = new Set(
    flights.map((flight) => flight.sessionId).filter((id): id is string => id !== null),
  );

  return {
    sessions,
    dropped: [...existing].filter((id) => !claimed.has(id)),
  };
}
