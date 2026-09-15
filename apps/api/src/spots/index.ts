/**
 * The spots module's public API.
 *
 * `SpotsFacade` is an abstract class and therefore a runtime value — it is
 * the DI token other modules inject, so it must not be exported as a type.
 */
export { SpotsFacade } from './abstract/spots.facade';
export { SpotsModule } from './spots.module';
