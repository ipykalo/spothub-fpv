/**
 * The geo module's public API. `CountryLookup` is an abstract class and so a
 * runtime value — the DI token — and must not be exported as a type.
 */
export { CountryLookup } from './abstract/country-lookup';
export { GeoModule } from './geo.module';
