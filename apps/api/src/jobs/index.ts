/**
 * The job queue's public surface.
 *
 * `JobQueue` is an abstract class and therefore a runtime value — it is the
 * DI token, so it must not be exported as a type.
 */
export { JobQueue } from './abstract/job-queue';
export type { JobHandler } from './abstract/job-queue';
export { JobsModule } from './jobs.module';
