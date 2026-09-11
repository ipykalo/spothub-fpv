/** What runs one type of job. Throwing means "try again later". */
export type JobHandler = (payload: Readonly<Record<string, unknown>>) => Promise<void>;

/**
 * Background work — the jobs module's public API.
 *
 * Anything too slow for a request goes here: the request queues it and
 * answers 202, and a worker in the same process picks it up. Jobs are rows in
 * Postgres, so queueing one can sit in the same transaction story as
 * everything else, and there is no broker to run, deploy or back up.
 *
 * A feature module registers its handlers from `onModuleInit`; the worker
 * starts only once the whole application has booted, so no job can arrive
 * before the handler that runs it.
 */
export abstract class JobQueue {
  /** Queues a job and nudges the worker. Resolves once the row is written. */
  abstract enqueue(
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<string>;

  /** Declares what runs `type`. Registering the same type twice is a bug. */
  abstract register(type: string, handler: JobHandler): void;
}
