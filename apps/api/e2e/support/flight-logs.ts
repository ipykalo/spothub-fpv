import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import type {
  CreateLogImportDto,
  KnownLogsResultDto,
  LogImportDto,
} from '@spothub/shared';
import { LogImportStatus } from '@spothub/shared';
import request from 'supertest';

import type { TestApp } from './app';

/** How long a real test import may take before a test gives up waiting. */
const IMPORT_TIMEOUT_MS = 20_000;
const POLL_MS = 300;

function auth(accessToken: string): [string, string] {
  return ['Authorization', `Bearer ${accessToken}`];
}

export async function knownChecksums(
  testApp: TestApp,
  accessToken: string,
  checksums: readonly string[],
): Promise<readonly string[]> {
  const response = await request(testApp.server)
    .post('/api/flight-logs/known')
    .set(...auth(accessToken))
    .send({ checksums });

  return (response.body as KnownLogsResultDto).known;
}

/**
 * Uploads one fixture file through the real presigned-PUT flow: a ticket from
 * the API, then the bytes straight to storage — exactly as the client does,
 * bytes never passing through a Nest route.
 */
export async function uploadFixture(
  testApp: TestApp,
  accessToken: string,
  path: string,
): Promise<{ logFileId: string; checksum: string }> {
  const bytes = readFileSync(path);
  const checksum = createHash('sha256').update(bytes).digest('hex');

  const ticket = await request(testApp.server)
    .post('/api/flight-logs/uploads')
    .set(...auth(accessToken))
    .send({ fileName: basename(path), sizeBytes: bytes.length, checksum });

  if (ticket.status !== 200) {
    throw new Error(
      `upload ticket refused for ${basename(path)}: HTTP ${String(ticket.status)} ${JSON.stringify(ticket.body)}`,
    );
  }

  const body = ticket.body as {
    logFileId: string;
    uploadUrl: string;
    contentType: string;
  };
  const put = await fetch(body.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': body.contentType },
    body: bytes,
  });

  if (!put.ok) {
    throw new Error(
      `PUT to storage failed for ${basename(path)}: HTTP ${String(put.status)}`,
    );
  }

  return { logFileId: body.logFileId, checksum };
}

/** Starts a batch and polls it until it leaves QUEUED/RUNNING. */
export async function runImport(
  testApp: TestApp,
  accessToken: string,
  input: CreateLogImportDto,
): Promise<LogImportDto> {
  const started = await request(testApp.server)
    .post('/api/flight-logs/imports')
    .set(...auth(accessToken))
    .send(input);

  if (started.status !== 202) {
    throw new Error(
      `import refused: HTTP ${String(started.status)} ${JSON.stringify(started.body)}`,
    );
  }

  let batch = started.body as LogImportDto;
  const deadline = Date.now() + IMPORT_TIMEOUT_MS;

  while (
    (batch.status === LogImportStatus.Queued ||
      batch.status === LogImportStatus.Running) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));

    const polled = await request(testApp.server)
      .get(`/api/flight-logs/imports/${batch.id}`)
      .set(...auth(accessToken));

    batch = polled.body as LogImportDto;
  }

  return batch;
}

/** Uploads one fixture and imports it in one call — the common case in these tests. */
export async function importFixture(
  testApp: TestApp,
  accessToken: string,
  path: string,
  options: { buildId?: string | null; flownOn?: string | null } = {},
): Promise<LogImportDto> {
  const { logFileId } = await uploadFixture(testApp, accessToken, path);

  return runImport(testApp, accessToken, {
    logFileIds: [logFileId],
    buildId: options.buildId ?? null,
    flownOn: options.flownOn ?? null,
  });
}
