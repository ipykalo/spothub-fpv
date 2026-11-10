import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';

import { PrismaService } from '../prisma';
import { UsersRepository } from './abstract/users.repository';
import type {
  AuthProviderKind,
  LinkIdentityInput,
  UpdateUserAdminData,
  UserEntity,
} from './user.entity';

/** How long an upload signed but never finished still counts against a limit. */
const PENDING_COUNTS_FOR_MS = 24 * 60 * 60 * 1000;

/**
 * The only place in the users feature that knows Prisma exists.
 * Everything above it speaks `UserEntity`.
 */
@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? PrismaUsersRepository.toEntity(user) : null;
  }

  async findByProviderSubject(
    provider: AuthProviderKind,
    subject: string,
  ): Promise<UserEntity | null> {
    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_subject: { provider, subject } },
      include: { user: true },
    });

    return identity ? PrismaUsersRepository.toEntity(identity.user) : null;
  }

  /**
   * Runs in a transaction because "find or create user" and "link identity"
   * must both happen or neither: a user row without its identity would be
   * unreachable at the next sign-in.
   */
  async upsertFromIdentity(input: LinkIdentityInput): Promise<UserEntity> {
    const email = input.email.toLowerCase();
    const provider = input.provider;

    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.authIdentity.findUnique({
        where: { provider_subject: { provider, subject: input.subject } },
        include: { user: true },
      });

      if (existing) {
        // Display name and avatar are refreshed on each sign-in; the email is
        // not, because the identity is keyed on the subject and a changed
        // Google email must not silently reassign the account.
        return tx.user.update({
          where: { id: existing.userId },
          data: {
            displayName: input.displayName ?? existing.user.displayName,
            avatarUrl: input.avatarUrl ?? existing.user.avatarUrl,
            lastSignInAt: new Date(),
          },
        });
      }

      const created = await tx.user.upsert({
        where: { email },
        create: {
          email,
          displayName: input.displayName,
          avatarUrl: input.avatarUrl,
          lastSignInAt: new Date(),
        },
        update: {
          displayName: input.displayName ?? undefined,
          avatarUrl: input.avatarUrl ?? undefined,
          lastSignInAt: new Date(),
        },
      });

      await tx.authIdentity.create({
        data: { userId: created.id, provider, subject: input.subject },
      });

      return created;
    });

    return PrismaUsersRepository.toEntity(user);
  }

  async findAll(): Promise<UserEntity[]> {
    const users = await this.prisma.user.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return users.map((user) => PrismaUsersRepository.toEntity(user));
  }

  async updateAdminFields(
    id: string,
    data: UpdateUserAdminData,
  ): Promise<UserEntity | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { id },
      data: {
        ...(data.status === undefined ? {} : { status: data.status }),
        ...(data.storageQuotaBytes === undefined
          ? {}
          : {
              storageQuotaBytes:
                data.storageQuotaBytes === null ? null : BigInt(data.storageQuotaBytes),
            }),
      },
    });

    return count === 0 ? null : this.findById(id);
  }

  /**
   * Two grouped sums over other modules' tables. A join in SQL, not a call
   * into their code: the same rule as a repository's owner predicate.
   */
  async storageUsedBy(ids: readonly string[]): Promise<ReadonlyMap<string, number>> {
    if (ids.length === 0) {
      return new Map();
    }

    const owners = { in: [...ids] };
    const counted = {
      OR: [
        { status: { not: 'PENDING' as const } },
        { createdAt: { gt: new Date(Date.now() - PENDING_COUNTS_FOR_MS) } },
      ],
    };

    const [assets, logs] = await Promise.all([
      this.prisma.asset.groupBy({
        by: ['ownerId'],
        where: { ownerId: owners, ...counted },
        _sum: { sizeBytes: true },
      }),
      this.prisma.logFile.groupBy({
        by: ['ownerId'],
        where: { ownerId: owners, ...counted },
        _sum: { sizeBytes: true },
      }),
    ]);

    const used = new Map<string, number>();

    for (const row of assets) {
      used.set(
        row.ownerId,
        (used.get(row.ownerId) ?? 0) + Number(row._sum.sizeBytes ?? 0),
      );
    }

    for (const row of logs) {
      used.set(row.ownerId, (used.get(row.ownerId) ?? 0) + (row._sum.sizeBytes ?? 0));
    }

    return used;
  }

  async setPilotName(id: string, pilotName: string | null): Promise<UserEntity | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { id },
      data: { pilotName },
    });
    return count > 0 ? this.findById(id) : null;
  }

  async setHomeCurrency(id: string, homeCurrency: string): Promise<UserEntity | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { id },
      data: { homeCurrency },
    });
    return count > 0 ? this.findById(id) : null;
  }

  countAdmins(): Promise<number> {
    return this.prisma.user.count({ where: { role: 'ADMIN' } });
  }

  async delete(id: string): Promise<boolean> {
    const { count } = await this.prisma.user.deleteMany({ where: { id } });
    return count > 0;
  }

  private static toEntity(user: User): UserEntity {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      pilotName: user.pilotName,
      homeCurrency: user.homeCurrency,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      storageQuotaBytes:
        user.storageQuotaBytes === null ? null : Number(user.storageQuotaBytes),
    };
  }
}
