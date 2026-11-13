/** A pilot someone blocked, as the domain understands it — no ORM types. */
export interface BlockedPilotEntity {
  readonly userId: string;
  /** Already through `publicName()`: never their full Google name or email. */
  readonly name: string;
  readonly blockedAt: Date;
}

/** A pilot who exists, and whether they may be blocked at all. */
export interface BlockTarget {
  readonly isAdmin: boolean;
}
