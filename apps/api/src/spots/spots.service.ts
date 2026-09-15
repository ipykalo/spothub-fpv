import { Injectable, NotFoundException } from '@nestjs/common';
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
import { SpotsRepository } from './abstract/spots.repository';
import type { UpdateSpotData } from './spot.entity';
import { toSpotDto } from './spots.mapper';

/** Business rules for spots. Knows nothing about HTTP or Prisma. */
@Injectable()
export class SpotsService {
  constructor(private readonly spots: SpotsRepository) {}

  async list(ownerId: string): Promise<SpotDto[]> {
    const spots = await this.spots.findManyForOwner(ownerId);
    return spots.map(toSpotDto);
  }

  async getOne(ownerId: string, id: string): Promise<SpotDto> {
    const spot = await this.spots.findOneForOwner(ownerId, id);

    if (!spot) {
      throw new NotFoundException('Spot not found');
    }

    return toSpotDto(spot);
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

    return toSpotDto(spot);
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

    return toSpotDto(spot);
  }

  async update(ownerId: string, id: string, input: UpdateSpotDto): Promise<SpotDto> {
    const data = toUpdateData(input);

    // Finishing a draft is the one time a slug is rewritten: "unnamed-location-3"
    // was never an address anyone kept.
    if (input.isDraft === false) {
      const current = await this.spots.findOneForOwner(ownerId, id);

      if (!current) {
        throw new NotFoundException('Spot not found');
      }

      if (current.isDraft) {
        data.slug = await this.slugFor(ownerId, input.name ?? current.name);
      }
    }

    const spot = await this.spots.updateForOwner(ownerId, id, data);

    if (!spot) {
      throw new NotFoundException('Spot not found');
    }

    return toSpotDto(spot);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const deleted = await this.spots.deleteForOwner(ownerId, id);

    if (!deleted) {
      throw new NotFoundException('Spot not found');
    }
  }

  private slugFor(ownerId: string, name: string): Promise<string> {
    return uniqueSlug(name, (candidate) => this.spots.slugExistsForOwner(ownerId, candidate));
  }
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdateSpotDto): { -readonly [K in keyof UpdateSpotData]: UpdateSpotData[K] } {
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
