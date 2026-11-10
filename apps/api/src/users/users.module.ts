import { Module } from '@nestjs/common';

import { UsersFacade } from './abstract/users.facade';
import { UsersRepository } from './abstract/users.repository';
import { UsersFacadeImpl } from './users.facade.impl';
import { PrismaUsersRepository } from './prisma-users.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * Accounts and the federated identities behind them, and the Admin page's
 * list of them.
 *
 * `UsersFacade` is the only provider exported — the repository stays inside,
 * so auth cannot reach past the narrow surface it is meant to use.
 */
@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    { provide: UsersRepository, useClass: PrismaUsersRepository },
    { provide: UsersFacade, useClass: UsersFacadeImpl },
  ],
  exports: [UsersFacade],
})
export class UsersModule {}
