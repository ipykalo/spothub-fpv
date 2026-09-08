import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthProviderKind, UserEntity } from './user.entity';
import { LinkIdentityInput, UsersRepository } from './users.repository';

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
          },
        });
      }

      const created = await tx.user.upsert({
        where: { email },
        create: { email, displayName: input.displayName, avatarUrl: input.avatarUrl },
        update: {
          displayName: input.displayName ?? undefined,
          avatarUrl: input.avatarUrl ?? undefined,
        },
      });

      await tx.authIdentity.create({
        data: { userId: created.id, provider, subject: input.subject },
      });

      return created;
    });

    return PrismaUsersRepository.toEntity(user);
  }

  private static toEntity(user: User): UserEntity {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
    };
  }
}
