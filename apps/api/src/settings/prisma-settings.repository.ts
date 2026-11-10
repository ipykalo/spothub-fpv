import { Injectable } from '@nestjs/common';
import type { AppSettings } from '@prisma/client';

import { PrismaService } from '../prisma';
import type { AppSettingsEntity, UpdateAppSettingsData } from './app-settings.entity';
import { SettingsRepository } from './abstract/settings.repository';

/** The single row's id, held to 1 by a CHECK in the migration. */
const ROW = 1;

/** The only place in the settings feature that knows Prisma exists. */
@Injectable()
export class PrismaSettingsRepository extends SettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * An upsert that changes nothing on an existing row, so two first requests
   * racing each other still end with one row.
   */
  async findOrCreate(initial: UpdateAppSettingsData): Promise<AppSettingsEntity> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: ROW },
      create: { id: ROW, ...toColumns(initial) },
      update: {},
    });

    return toEntity(row);
  }

  async update(
    initial: UpdateAppSettingsData,
    data: UpdateAppSettingsData,
  ): Promise<AppSettingsEntity> {
    const row = await this.prisma.appSettings.upsert({
      where: { id: ROW },
      create: { id: ROW, ...toColumns(initial), ...toColumns(data) },
      update: toColumns(data),
    });

    return toEntity(row);
  }
}

function toColumns(data: UpdateAppSettingsData): {
  openRegistration?: boolean;
  allowedEmails?: string[];
  defaultStorageQuotaBytes?: bigint;
} {
  return {
    ...(data.openRegistration === undefined
      ? {}
      : { openRegistration: data.openRegistration }),
    ...(data.allowedEmails === undefined
      ? {}
      : { allowedEmails: [...data.allowedEmails] }),
    ...(data.defaultStorageQuotaBytes === undefined
      ? {}
      : { defaultStorageQuotaBytes: BigInt(data.defaultStorageQuotaBytes) }),
  };
}

function toEntity(row: AppSettings): AppSettingsEntity {
  return {
    openRegistration: row.openRegistration,
    allowedEmails: row.allowedEmails,
    // A terabyte is far inside a double's exact range.
    defaultStorageQuotaBytes: Number(row.defaultStorageQuotaBytes),
    updatedAt: row.updatedAt,
  };
}
