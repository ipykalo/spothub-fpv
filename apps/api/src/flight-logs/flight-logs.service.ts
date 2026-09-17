import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type CreateLogImportDto,
  type FlightTrackDto,
  type FlightTrackPointDto,
  type KnownLogsDto,
  type KnownLogsResultDto,
  type LogImportDto,
  type LogUploadTicketDto,
  type RequestLogUploadDto,
  logFormatOf,
} from '@spothub/shared';

import type { Env } from '../config';
import { FlightsFacade } from '../flights';
import { JobQueue } from '../jobs';
import { StorageGateway } from '../storage';
import { FlightLogsRepository } from './abstract/flight-logs.repository';
import { FLIGHT_LOG_IMPORT_JOB } from './flight-log-import.job';
import { toLogImportDto } from './flight-logs.mapper';
import { type Fix, haversineM } from './formats/gps-track';
import { LogReaders } from './formats/log-readers';

/** More than a map can draw apart: beyond this a track is dots on dots. */
const MAX_TRACK_POINTS = 600;

/**
 * A fix this far outside the flight still belongs to it: a radio's clock and
 * a phone's GPS rarely agree to the second, and a track that stops short of
 * the landing looks like a lost signal.
 */
const WINDOW_SLACK_MS = 5_000;

/** Speed is measured over at least this long: fix to fix is mostly noise. */
const SPEED_WINDOW_MS = 1_000;

/**
 * Getting logs in. Knows nothing about HTTP, Prisma or S3.
 *
 * The bytes never arrive in a request. The client learns which files are new,
 * PUTs those straight to storage on presigned URLs, and then starts an import,
 * which is queued and answered at once — the parsing happens in the job.
 */
@Injectable()
export class FlightLogsService {
  private readonly uploadTtl: number;

  constructor(
    private readonly logs: FlightLogsRepository,
    private readonly flights: FlightsFacade,
    private readonly storage: StorageGateway,
    private readonly jobs: JobQueue,
    private readonly readers: LogReaders,
    config: ConfigService<Env, true>,
  ) {
    this.uploadTtl = config.get('S3_UPLOAD_URL_TTL', { infer: true });
  }

  /**
   * Which of these files are already in.
   *
   * The whole LOGS folder is dropped every time, so without this every import
   * would re-upload a season of logs to find out they were all known.
   */
  async known(ownerId: string, input: KnownLogsDto): Promise<KnownLogsResultDto> {
    return { known: await this.logs.findImportedChecksums(ownerId, input.checksums) };
  }

  async requestUpload(
    ownerId: string,
    input: RequestLogUploadDto,
  ): Promise<LogUploadTicketDto> {
    const format = logFormatOf(input.fileName);

    if (format === null) {
      throw new BadRequestException(
        'Only EdgeTX .csv logs, Betaflight .bbl blackbox logs and .gpx tracks can be imported',
      );
    }

    const reader = this.readers.for(format);

    // The key is ours, never the radio's or the flight controller's file name.
    const file = await this.logs.reserveFile({
      ownerId,
      format,
      storageKey: `${ownerId}/logs/${randomUUID()}${reader.extension}`,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      checksum: input.checksum,
    });

    if (!file) {
      throw new ConflictException('That log has already been imported');
    }

    const uploadUrl = await this.storage.presignPut(
      file.storageKey,
      reader.contentType,
      this.uploadTtl,
    );

    return {
      logFileId: file.id,
      uploadUrl,
      contentType: reader.contentType,
      expiresInSeconds: this.uploadTtl,
    };
  }

  /** Queues the batch and answers straight away. */
  async startImport(ownerId: string, input: CreateLogImportDto): Promise<LogImportDto> {
    if (
      input.buildId !== null &&
      !(await this.flights.buildBelongsToOwner(ownerId, input.buildId))
    ) {
      throw new NotFoundException('Build not found');
    }

    const batch = await this.logs.createImport(
      ownerId,
      input.buildId,
      input.flownOn,
      input.logFileIds,
    );

    if (!batch) {
      throw new BadRequestException('Some of those logs are not waiting to be imported');
    }

    await this.jobs.enqueue(FLIGHT_LOG_IMPORT_JOB, { importId: batch.id, ownerId });

    return toLogImportDto(batch);
  }

  async getImport(ownerId: string, id: string): Promise<LogImportDto> {
    const batch = await this.logs.findImport(ownerId, id);

    if (!batch) {
      throw new NotFoundException('Import not found');
    }

    return toLogImportDto(batch);
  }

  /**
   * A flight's path, read back from the log it arrived in.
   *
   * Nothing is stored twice: the file is still in the bucket, so the fixes are
   * parsed on demand and thinned to what a map can draw. A flight from a
   * blackbox log has a track only where a GPX joined it — its own log records
   * no time of day to place fixes against.
   */
  async track(ownerId: string, flightId: string): Promise<FlightTrackDto> {
    const source = await this.logs.findTrackSource(ownerId, flightId);

    if (!source) {
      throw new NotFoundException('Flight not found');
    }

    const stored = await this.storage.get(source.storageKey);

    if (!stored) {
      throw new NotFoundException('The log this flight came in is no longer stored');
    }

    const fixes = await this.readers.for(source.format).fixes(stored.body);
    const from = source.startedAt.getTime() - WINDOW_SLACK_MS;
    const to = source.endedAt.getTime() + WINDOW_SLACK_MS;
    const own = fixes.filter((fix) => fix.t >= from && fix.t <= to);

    return {
      flightId,
      points: toPoints(thin(own), source.startedAt.getTime()),
      takeoffAltitudeM: own.at(0)?.altitude ?? null,
    };
  }
}

/** Every nth fix, so a long track still draws as the same shape. */
function thin(fixes: readonly Fix[]): readonly Fix[] {
  if (fixes.length <= MAX_TRACK_POINTS) {
    return fixes;
  }

  const step = Math.ceil(fixes.length / MAX_TRACK_POINTS);
  const kept = fixes.filter((_, index) => index % step === 0);
  const last = fixes.at(-1);

  // The landing is worth keeping whatever the arithmetic says.
  return last && kept.at(-1) !== last ? [...kept, last] : kept;
}

/**
 * Fixes as the wire shape: timed from the flight's own start, and with the
 * speed each was travelling at, measured over a second or so of track either
 * side rather than from the fix before it, which is mostly noise.
 */
function toPoints(fixes: readonly Fix[], startedAt: number): FlightTrackPointDto[] {
  return fixes.map((fix, index) => ({
    t: fix.t - startedAt,
    lat: fix.lat,
    lng: fix.lon,
    altM: fix.altitude,
    speedKmh: speedAt(fixes, index),
  }));
}

function speedAt(fixes: readonly Fix[], index: number): number | null {
  let back = index;
  let forward = index;

  while (back > 0 && fixes[index].t - fixes[back].t < SPEED_WINDOW_MS / 2) {
    back -= 1;
  }

  while (
    forward < fixes.length - 1 &&
    fixes[forward].t - fixes[index].t < SPEED_WINDOW_MS / 2
  ) {
    forward += 1;
  }

  const seconds = (fixes[forward].t - fixes[back].t) / 1000;

  if (seconds <= 0) {
    return null;
  }

  let metres = 0;

  for (let step = back; step < forward; step += 1) {
    metres += haversineM(fixes[step], fixes[step + 1]);
  }

  return Math.round((metres / seconds) * 3.6 * 10) / 10;
}
