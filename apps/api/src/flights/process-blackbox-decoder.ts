import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config';
import { BlackboxDecoder } from './abstract/blackbox-decoder';
import { LogParseError } from './parsed-log';

const run = promisify(execFile);

/** A long flight decodes in seconds; anything near this has hung. */
const DECODE_TIMEOUT_MS = 120_000;

/** The decoder writes one CSV per log of the file it is given: `log.01.csv`, `log.02.csv`. */
const LOG_CSV = /^log\.(\d+)\.csv$/;

const UNREADABLE = 'Not a blackbox log the decoder can read';

/**
 * Runs Betaflight's blackbox_decode over a temporary copy of the file.
 *
 * The decoder only reads a file and writes files beside it, so every call gets
 * a fresh directory, removed however the decode ends. Frame times come out in
 * seconds; voltage and current stay in the decoder's volts and amps.
 */
@Injectable()
export class ProcessBlackboxDecoder extends BlackboxDecoder {
  private readonly path: string;
  private readonly dockerImage: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.path = config.get('BLACKBOX_DECODE_PATH', { infer: true });
    this.dockerImage = config.get('BLACKBOX_DECODE_DOCKER_IMAGE', { infer: true });
  }

  async decode(bytes: Buffer): Promise<string[]> {
    const dir = await mkdtemp(join(tmpdir(), 'spothub-bbl-'));

    try {
      await writeFile(join(dir, 'log.bbl'), bytes);
      const [command, args] = this.command(dir);

      try {
        await run(command, args, { timeout: DECODE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 });
      } catch (error) {
        // A decoder that is not installed is the server's fault, not the
        // log's: let the job fail and retry rather than mark the file unreadable.
        if (isMissingProgram(error)) {
          throw error;
        }

        throw new LogParseError(UNREADABLE);
      }

      const logs = (await readdir(dir))
        .flatMap((name) => {
          const match = LOG_CSV.exec(name);
          return match ? [{ name, index: Number(match[1]) }] : [];
        })
        .sort((a, b) => a.index - b.index);

      if (logs.length === 0) {
        throw new LogParseError(UNREADABLE);
      }

      return await Promise.all(logs.map((log) => readFile(join(dir, log.name), 'utf8')));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private command(dir: string): [string, string[]] {
    const options = (outputDir: string): string[] => [
      '--unit-frame-time',
      's',
      '--output-dir',
      outputDir,
    ];

    if (this.dockerImage) {
      return [
        'docker',
        [
          'run',
          '--rm',
          '--mount',
          `type=bind,source=${dir},target=/work`,
          this.dockerImage,
          ...options('/work'),
          '/work/log.bbl',
        ],
      ];
    }

    return [this.path, [...options(dir), join(dir, 'log.bbl')]];
  }
}

function isMissingProgram(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
