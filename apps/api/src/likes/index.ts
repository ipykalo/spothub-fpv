/**
 * The likes module's public API.
 *
 * `LikesFacade` is an abstract class and therefore a runtime value — it is the
 * DI token `posts` and `builds` inject, so it must not be exported as a type.
 */
export { LikesFacade } from './abstract/likes.facade';
export { LikesModule } from './likes.module';
