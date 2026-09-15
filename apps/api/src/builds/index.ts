/**
 * The builds module's public API.
 *
 * `BuildsFacade` is an abstract class and therefore a runtime value — it is
 * the DI token `comments` injects, so it must not be exported as a type.
 * Sibling hangar modules still reach a build through a join in their own
 * repository, never through a call into here.
 */
export { BuildsFacade } from './abstract/builds.facade';
export { BuildsModule } from './builds.module';
