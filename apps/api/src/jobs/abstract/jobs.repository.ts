import type { ClaimedJob } from '../job.entity';

/**
 * Persistence contract for the queue.
 *
 * Claiming is the one operation that has to be atomic: two workers — two API
 * replicas, one day — must never run the same job. The implementation does it
 * in a single statement with `FOR UPDATE SKIP LOCKED`.
 */
export abstract class JobsRepository {
  abstract enqueue(
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<string>;

  /**
   * The next job ready to run, now marked RUNNING — or null.
   *
   * A RUNNING job locked longer ago than `staleAfterMs` belonged to a process
   * that died mid-job, and is claimed again rather than stuck forever.
   */
  abstract claimNext(staleAfterMs: number): Promise<ClaimedJob | null>;

  abstract complete(id: string): Promise<void>;

  /** Requeued after `retryInMs` while attempts remain; failed for good after. */
  abstract fail(job: ClaimedJob, error: string, retryInMs: number): Promise<void>;
}
