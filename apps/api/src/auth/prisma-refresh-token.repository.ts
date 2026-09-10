import { Injectable } from '@nestjs/common';
import type { RefreshToken } from '@prisma/client';

import { PrismaService } from '../prisma';
import type { RefreshTokenEntity } from './refresh-token.entity';
import {
  RefreshTokenRepository,
  StoreRefreshTokenInput,
} from './abstract/refresh-token.repository';

@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async store(input: StoreRefreshTokenInput): Promise<void> {
    await this.prisma.refreshToken.create({ data: { ...input } });
  }

  async findById(id: string): Promise<RefreshTokenEntity | null> {
    const token = await this.prisma.refreshToken.findUnique({ where: { id } });
    return token ? PrismaRefreshTokenRepository.toEntity(token) : null;
  }

  async markRotated(id: string, replacedById: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async deleteExpired(now: Date): Promise<number> {
    const { count } = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });

    return count;
  }

  private static toEntity(token: RefreshToken): RefreshTokenEntity {
    return {
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      familyId: token.familyId,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
    };
  }
}
