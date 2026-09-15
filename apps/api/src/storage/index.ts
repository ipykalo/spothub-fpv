/**
 * Object storage's public surface.
 *
 * `StorageGateway` is an abstract class and therefore a runtime value — it is
 * the DI token, so it must not be exported as a type.
 */
export { StorageGateway } from './abstract/storage.gateway';
export type { StoredObject } from './abstract/storage.gateway';
export { StorageModule } from './storage.module';
