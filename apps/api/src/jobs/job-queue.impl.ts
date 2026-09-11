import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { type JobHandler, JobQueue } from './abstract/job-queue';
import { JobsRepository } from './abstract/jobs.repository';
import type { ClaimedJob } from './job.entity';

/** How often an idle worker looks for work nobody nudged it about. */
const POLL_MS = 5_000;

/** A job RUNNING this long belonged to a process that died. */
const STALE_AFTER_MS = 10 * 60_000;

/** The first retry waits this long; each one after waits twice as long. */
const RETRY_BASE_MS = 30_000;

/**
 * The queue, and the worker that drains it, in the API process.
 *
 * One job at a time. At a handful of imports a day that is ample, and it
 * keeps a big SD card from starving the requests the API is there to serve.
 * The worker sleeps between polls and is woken early whenever this process
 * queues something, so an import starts at once rather than on the next tick.
 */
@Injectable()
export class JobQueueImpl
  extends JobQueue
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draining: Promise<void> | null = null;
  private stopped = true;

  constructor(private readonly jobs: JobsRepository) {
    super();
  }

  register(type: string, handler: JobHandler): void {
    if (this.handlers.has(type)) {
      throw new Error(`A handler for "${type}" is already registered`);
    }

    this.handlers.set(type, handler);
  }

  async enqueue(
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    const id = await this.jobs.enqueue(type, payload);
    this.wake();
    return id;
  }

  /** After every module's `onModuleInit`, so every handler is registered. */
  onApplicationBootstrap(): void {
    this.stopped = false;
    this.schedule(0);
  }

  /** Lets the job in hand finish rather than abandoning it half-written. */
  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    await this.draining;
  }

  private wake(): void {
    if (!this.stopped && this.draining === null) {
      this.schedule(0);
    }
  }

  private schedule(delayMs: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.draining = this.drain()
        .catch((error: unknown) => {
          this.logger.error('The job worker stopped on an error', error);
        })
        .finally(() => {
          this.draining = null;

          if (!this.stopped) {
            this.schedule(POLL_MS);
          }
        });
    }, delayMs);
  }

  /** Runs jobs until none is ready. */
  private async drain(): Promise<void> {
    while (!this.stopped) {
      const job = await this.jobs.claimNext(STALE_AFTER_MS);

      if (!job) {
        return;
      }

      await this.run(job);
    }
  }

  private async run(job: ClaimedJob): Promise<void> {
    const handler = this.handlers.get(job.type);

    if (!handler) {
      // Retrying will not make a handler appear; fail it for good.
      await this.jobs.fail(
        { ...job, attempts: job.maxAttempts },
        `No handler registered for "${job.type}"`,
        0,
      );
      return;
    }

    try {
      await handler(asRecord(job.payload));
      await this.jobs.complete(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Job ${job.type} ${job.id} failed on attempt ${job.attempts} of ${job.maxAttempts}: ${message}`,
      );
      await this.jobs.fail(job, message, RETRY_BASE_MS * 2 ** (job.attempts - 1));
    }
  }
}

function asRecord(payload: unknown): Readonly<Record<string, unknown>> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}
