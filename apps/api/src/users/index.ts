/**
 * The users module's public API.
 *
 * `UsersFacade` is an abstract class and therefore a runtime value — it is the
 * DI token other modules inject, so it must not be exported as a type.
 */
export { UsersFacade } from './abstract/users.facade';
export { AuthProviderKind } from './user.entity';
export type { LinkIdentityInput, UserEntity } from './user.entity';
export { UsersModule } from './users.module';
