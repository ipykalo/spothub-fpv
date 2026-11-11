/**
 * The exchange-rates module's public API.
 *
 * `ExchangeRatesFacade` and `RateSource` are abstract classes and therefore
 * runtime values — DI tokens — so they must not be exported as types.
 * `RateSource` is here only so the e2e suite can swap the bank for a stub.
 */
export { ExchangeRatesFacade } from './abstract/exchange-rates.facade';
export { RateSource } from './abstract/rate-source';
export type { ConvertedTotal, DatedAmount } from './conversion';
export { ExchangeRatesModule } from './exchange-rates.module';
