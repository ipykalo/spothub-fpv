/**
 * The settings module's public API.
 *
 * `SettingsFacade` is an abstract class and therefore a runtime value — it is
 * the DI token `auth` injects, so it must not be exported as a type.
 */
export { SettingsFacade } from './abstract/settings.facade';
export { SettingsModule } from './settings.module';
