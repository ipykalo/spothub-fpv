/**
 * The media module's public API.
 *
 * `MediaFacade` is an abstract class and therefore a runtime value — it is the
 * DI token other modules inject, so it must not be exported as a type.
 */
export { MediaFacade } from './abstract/media.facade';
export { MediaModule } from './media.module';
