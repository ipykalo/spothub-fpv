import { Injectable } from '@nestjs/common';
import { JobStatus, type Prisma } from '@prisma/client';

import { PrismaService } from '../prisma';
import { JobsRepository } from './abstract/jobs.repository';
import type { ClaimedJob } from './job.entity';

interface ClaimedRow {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly attempts: number;
  readonly max_attempts: number;
}

/** The only place the queue knows Prisma exists. */
@Injectable()
export class PrismaJobsRepository extends JobsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enqueue(
    type: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<string> {
    const job = await this.prisma.job.create({
      data: { type, payload: payload as Prisma.InputJsonObject },
      select: { id: true },
    });

    return job.id;
  }

  /**
   * Raw SQL, because Prisma cannot say `SKIP LOCKED`.
   *
   * The inner select locks one runnable row and skips any another worker has
   * locked; the outer update claims it; both happen in one statement, so there
   * is no window in which two workers see the same job as free. Times come
   * from here rather than the database's `now()`, so the comparison cannot
   * depend on the session's time zone.
   */
  async claimNext(staleAfterMs: number): Promise<ClaimedJob | null> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - staleAfterMs);

    const rows = await this.prisma.$queryRaw<ClaimedRow[]>`
      UPDATE jobs
         SET status = 'RUNNING', locked_at = ${now}, attempts = attempts + 1, updated_at = ${now}
       WHERE id = (
         SELECT id FROM jobs
          WHERE (status = 'QUEUED' AND run_after <= ${now})
             OR (status = 'RUNNING' AND locked_at < ${staleBefore})
          ORDER BY run_after
          LIMIT 1
          FOR UPDATE SKIP LOCKED
       )
      RETURNING id, type, payload, attempts, max_attempts`;

    const row = rows.at(0);

    return row
      ? {
          id: row.id,
          type: row.type,
          payload: row.payload,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
        }
      : null;
  }

  async complete(id: string): Promise<void> {
    await this.prisma.job.updateMany({
      where: { id },
      data: { status: JobStatus.DONE, lockedAt: null, lastError: null },
    });
  }

  async fail(job: ClaimedJob, error: string, retryInMs: number): Promise<void> {
    const exhausted = job.attempts >= job.maxAttempts;

    await this.prisma.job.updateMany({
      where: { id: job.id },
      data: exhausted
        ? { status: JobStatus.FAILED, lockedAt: null, lastError: error }
        : {
            status: JobStatus.QUEUED,
            lockedAt: null,
            lastError: error,
            runAfter: new Date(Date.now() + retryInMs),
          },
    });
  }
}
