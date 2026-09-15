/** A job a worker has claimed and is about to run. */
export interface ClaimedJob {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  /** Including this one. */
  readonly attempts: number;
  readonly maxAttempts: number;
}
