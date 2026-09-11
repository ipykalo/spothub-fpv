import { Module } from '@nestjs/common';

import { JobQueue } from './abstract/job-queue';
import { JobsRepository } from './abstract/jobs.repository';
import { JobQueueImpl } from './job-queue.impl';
import { PrismaJobsRepository } from './prisma-jobs.repository';

/**
 * Background jobs, queued in Postgres — infrastructure, like `prisma/` and
 * `storage/`: it knows nothing of any feature, and features depend on it.
 *
 * Nest dedupes modules, so however many feature modules import this, there is
 * one queue and one worker in the process.
 */
@Module({
  providers: [
    { provide: JobsRepository, useClass: PrismaJobsRepository },
    { provide: JobQueue, useClass: JobQueueImpl },
  ],
  exports: [JobQueue],
})
export class JobsModule {}
