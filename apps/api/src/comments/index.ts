/**
 * The comments module's public API.
 *
 * `CommentsFacade` is an abstract class and therefore a runtime value — it is
 * the DI token `reports` injects, so it must not be exported as a type.
 */
export { CommentsFacade } from './abstract/comments.facade';
export { CommentsModule } from './comments.module';
