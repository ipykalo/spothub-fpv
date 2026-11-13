import type { INestApplication } from '@nestjs/common';

import { PrismaService } from '../../src/prisma';

const WAIT_MS = 15_000;

/**
 * Waits until no job of this type queued since `since` is still queued or
 * running. A spec whose requests queue background work calls it before
 * closing the app: a job still running at shutdown outlives the database
 * connection and logs an error. Only the spec's own jobs count — one left
 * RUNNING by an earlier run that was killed waits for its lock to go stale.
 */
export async function waitForJobs(
  app: INestApplication,
  type: string,
  since: Date,
): Promise<void> {
  const prisma = app.get(PrismaService);
  const deadline = Date.now() + WAIT_MS;

  while (
    (await prisma.job.count({
      where: { type, createdAt: { gte: since }, status: { in: ['QUEUED', 'RUNNING'] } },
    })) > 0
  ) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${type} jobs`);
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
