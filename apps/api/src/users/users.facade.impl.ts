import { Injectable } from '@nestjs/common';

import { UsersFacade } from './abstract/users.facade';
import { UsersRepository } from './abstract/users.repository';
import type { LinkIdentityInput, UserEntity } from './user.entity';

/** Serves the users facade out of the module's own repository. */
@Injectable()
export class UsersFacadeImpl extends UsersFacade {
  constructor(private readonly users: UsersRepository) {
    super();
  }

  findById(id: string): Promise<UserEntity | null> {
    return this.users.findById(id);
  }

  upsertFromIdentity(input: LinkIdentityInput): Promise<UserEntity> {
    return this.users.upsertFromIdentity(input);
  }
}
