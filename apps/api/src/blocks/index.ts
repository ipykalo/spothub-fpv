/**
 * The blocks module's public API.
 *
 * `BlocksFacade` is an abstract class and therefore a runtime value: it is the
 * DI token `comments` injects, so it must not be exported as a type.
 */
export { BlocksFacade } from './abstract/blocks.facade';
export { BlocksModule } from './blocks.module';
