/**
 * Which country an IP address is in — the geo module's public API, and its DI
 * token. Answered from a database file on the server, so no address is ever
 * sent anywhere to be looked up.
 */
export abstract class CountryLookup {
  /**
   * The ISO 3166-1 alpha-2 code (`UA`, `RU`), or null for an address the
   * database does not place — loopback, a private network, or no database.
   */
  abstract countryOf(ip: string | undefined): string | null;
}
