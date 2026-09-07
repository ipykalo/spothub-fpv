import { Module } from '@nestjs/common';

import { PrismaUsersRepository } from './prisma-users.repository';
import { UsersRepository } from './users.repository';

@Module({
  providers: [{ provide: UsersRepository, useClass: PrismaUsersRepository }],
  exports: [UsersRepository],
})
export class UsersModule {}
