import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type CreateDraftSpotDto,
  type CreateSpotDto,
  DRAFT_SPOT_NAME,
  SpotAccess,
  type SpotDto,
  type UpdateSpotDto,
  Visibility,
} from '@spothub/shared';

import { uniqueSlug } from '../common';
import type { Env } from '../config';
import { JobQueue } from '../jobs';
import { StorageGateway } from '../storage';
import { SpotsRepository } from './abstract/spots.repository';
import { SPOT_COVER_JOB } from './spot-cover.job';
import type { SpotEntity, UpdateSpotData } from './spot.entity';
import { toSpotDto } from './spots.mapper';

/**
 * Business rules for spots. Knows nothing about HTTP, Prisma or S3.
 *
 * Reading and writing are asked differently on purpose. Anyone signed in may
 * read a spot shared with them; only its owner may change or delete it, and
 * those paths never go through the shared read.
 */
@Injectable()
export class SpotsService {
  private readonly downloadTtl: number;

  constructor(
    private readonly spots: SpotsRepository,
    private readonly storage: StorageGateway,
    private readonly jobs: JobQueue,
    config: ConfigService<Env, true>,
  ) {
    this.downloadTtl = config.get('S3_DOWNLOAD_URL_TTL', { infer: true });
  }

  /** The viewer's own spots. */
  async list(ownerId: string): Promise<SpotDto[]> {
    return this.toDtos(await this.spots.findManyForOwner(ownerId), ownerId);
  }

  /** Other owners' Public spots. */
  async listShared(viewerId: string): Promise<SpotDto[]> {
    return this.toDtos(await this.spots.findSharedForViewer(viewerId), viewerId);
  }

  /** The viewer's own spot, or one shared with them. Anything else is not found. */
  async getOne(viewerId: string, id: string): Promise<SpotDto> {
    const spot = await this.spots.findVisibleForViewer(viewerId, id);

    if (!spot) {
      throw new NotFoundException('Spot not found');
    }

    return toSpotDto(spot, await this.coverUrlFor(spot), viewerId);
  }

  async create(ownerId: string, input: CreateSpotDto): Promise<SpotDto> {
    const spot = await this.spots.create({
      ownerId,
      slug: await this.slugFor(ownerId, input.name),
      name: input.name,
      lat: input.lat,
      lng: input.lng,
      locality: input.locality,
      terrain: input.terrain,
      access: input.access,
      difficulty: input.difficulty,
      hazards: input.hazards,
      descriptionMd: input.descriptionMd,
      accessNotesMd: input.accessNotesMd,
      visibility: input.visibility,
      isDraft: false,
      video: input.video,
    });

    await this.queueCover(spot);

    return toSpotDto(spot, null, ownerId);
  }

  /**
   * A location captured at the field with nothing else known yet: the fix and
   * a placeholder name. Private, and flagged as a draft, so nothing that lists
   * spots publicly shows it until it has been filled in.
   */
  async createDraft(ownerId: string, input: CreateDraftSpotDto): Promise<SpotDto> {
    const spot = await this.spots.create({
      ownerId,
      slug: await this.slugFor(ownerId, DRAFT_SPOT_NAME),
      name: DRAFT_SPOT_NAME,
      lat: input.lat,
      lng: input.lng,
      locality: null,
      terrain: null,
      access: SpotAccess.Unknown,
      difficulty: null,
      hazards: [],
      descriptionMd: null,
      accessNotesMd: null,
      visibility: Visibility.Private,
      isDraft: true,
      video: null,
    });

    return toSpotDto(spot, null, ownerId);
  }

  async update(ownerId: string, id: string, input: UpdateSpotDto): Promise<SpotDto> {
    const data = toUpdateData(input);
    const current =
      input.isDraft === false || input.video !== undefined
        ? await this.spots.findOneForOwner(ownerId, id)
        : null;

    if ((input.isDraft === false || input.video !== undefined) && !current) {
      throw new NotFoundException('Spot not found');
    }

    // Finishing a draft is the one time a slug is rewritten: "unnamed-location-3"
    // was never an address anyone kept.
    if (current?.isDraft && input.isDraft === false) {
      data.slug = await this.slugFor(ownerId, input.name ?? current.name);
    }

    // A different video, or none: the cover made for the old one goes with it.
    // The same video with a new start time keeps its cover.
    let staleCover: string | null = null;
    let videoChanged = false;

    if (
      current &&
      input.video !== undefined &&
      input.video?.youtubeId !== current.video?.youtubeId
    ) {
      videoChanged = true;
      staleCover = current.coverStorageKey;
      data.coverStorageKey = null;
    }

    const spot = await this.spots.updateForOwner(ownerId, id, data);

    if (!spot) {
      throw new NotFoundException('Spot not found');
    }

    if (videoChanged) {
      if (staleCover !== null) {
        await this.storage.delete([staleCover]);
      }

      await this.queueCover(spot);
    }

    return toSpotDto(spot, await this.coverUrlFor(spot), ownerId);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const spot = await this.spots.findOneForOwner(ownerId, id);
    const deleted = await this.spots.deleteForOwner(ownerId, id);

    if (!deleted) {
      throw new NotFoundException('Spot not found');
    }

    if (spot?.coverStorageKey) {
      await this.storage.delete([spot.coverStorageKey]);
    }
  }

  private slugFor(ownerId: string, name: string): Promise<string> {
    return uniqueSlug(name, (candidate) =>
      this.spots.slugExistsForOwner(ownerId, candidate),
    );
  }

  /** Signing is a local computation, so a page of cards costs no extra round trips. */
  private toDtos(spots: readonly SpotEntity[], viewerId: string): Promise<SpotDto[]> {
    return Promise.all(
      spots.map(async (spot) => toSpotDto(spot, await this.coverUrlFor(spot), viewerId)),
    );
  }

  /** The cover job fetches the video's thumbnail once; nothing asks YouTube per view. */
  private async queueCover(spot: SpotEntity): Promise<void> {
    if (spot.video) {
      await this.jobs.enqueue(SPOT_COVER_JOB, {
        ownerId: spot.ownerId,
        spotId: spot.id,
        youtubeId: spot.video.youtubeId,
      });
    }
  }

  private coverUrlFor(spot: SpotEntity): Promise<string | null> {
    return spot.coverStorageKey === null
      ? Promise.resolve(null)
      : this.storage.presignGet(spot.coverStorageKey, this.downloadTtl);
  }
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdateSpotDto): {
  -readonly [K in keyof UpdateSpotData]: UpdateSpotData[K];
} {
  const data: { -readonly [K in keyof UpdateSpotData]: UpdateSpotData[K] } = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.lat !== undefined) data.lat = input.lat;
  if (input.lng !== undefined) data.lng = input.lng;
  if (input.locality !== undefined) data.locality = input.locality;
  if (input.terrain !== undefined) data.terrain = input.terrain;
  if (input.access !== undefined) data.access = input.access;
  if (input.difficulty !== undefined) data.difficulty = input.difficulty;
  if (input.hazards !== undefined) data.hazards = input.hazards;
  if (input.descriptionMd !== undefined) data.descriptionMd = input.descriptionMd;
  if (input.accessNotesMd !== undefined) data.accessNotesMd = input.accessNotesMd;
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (input.isDraft !== undefined) data.isDraft = input.isDraft;
  if (input.video !== undefined) data.video = input.video;

  return data;
}
