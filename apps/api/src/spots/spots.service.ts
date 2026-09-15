import { Injectable, NotFoundException } from '@nestjs/common';
import type { CreateSpotDto, SpotDto, UpdateSpotDto } from '@spothub/shared';

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
    const slug = await uniqueSlug(input.name, (candidate) =>
      this.spots.slugExistsForOwner(ownerId, candidate),
    );

    const spot = await this.spots.create({
      ownerId,
      slug,
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
    });

    return toSpotDto(spot);
  }

  async update(ownerId: string, id: string, input: UpdateSpotDto): Promise<SpotDto> {
    const spot = await this.spots.updateForOwner(ownerId, id, toUpdateData(input));

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
}

/**
 * Copies only the keys actually present on the patch, so an absent field is
 * left alone rather than being written as null.
 */
function toUpdateData(input: UpdateSpotDto): UpdateSpotData {
  const data: UpdateSpotData = {};
  const patch = data as Record<string, unknown>;

  if (input.name !== undefined) patch['name'] = input.name;
  if (input.lat !== undefined) patch['lat'] = input.lat;
  if (input.lng !== undefined) patch['lng'] = input.lng;
  if (input.locality !== undefined) patch['locality'] = input.locality;
  if (input.terrain !== undefined) patch['terrain'] = input.terrain;
  if (input.access !== undefined) patch['access'] = input.access;
  if (input.difficulty !== undefined) patch['difficulty'] = input.difficulty;
  if (input.hazards !== undefined) patch['hazards'] = input.hazards;
  if (input.descriptionMd !== undefined) patch['descriptionMd'] = input.descriptionMd;
  if (input.accessNotesMd !== undefined) patch['accessNotesMd'] = input.accessNotesMd;
  if (input.visibility !== undefined) patch['visibility'] = input.visibility;

  return data;
}
