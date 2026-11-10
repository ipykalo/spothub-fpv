import { z } from 'zod';

/**
 * The currencies a price may be in: the hryvnia and every currency the
 * National Bank of Ukraine publishes an official rate for. Only these, so
 * every price on the site can be converted into a total — a currency nobody
 * can convert would be a price that never adds up. A pilot whose own
 * currency is not here keeps their prices in USD or EUR.
 *
 * Adding one means adding a rate source that covers it, not only a line here.
 */
export const CURRENCY_NAMES = {
  UAH: 'Ukrainian hryvnia',
  USD: 'US dollar',
  EUR: 'Euro',
  GBP: 'Pound sterling',
  CHF: 'Swiss franc',
  PLN: 'Polish złoty',
  CZK: 'Czech koruna',
  HUF: 'Hungarian forint',
  RON: 'Romanian leu',
  SEK: 'Swedish krona',
  NOK: 'Norwegian krone',
  DKK: 'Danish krone',
  RSD: 'Serbian dinar',
  MDL: 'Moldovan leu',
  GEL: 'Georgian lari',
  AZN: 'Azerbaijani manat',
  TRY: 'Turkish lira',
  CAD: 'Canadian dollar',
  MXN: 'Mexican peso',
  INR: 'Indian rupee',
  CNY: 'Chinese yuan',
  JPY: 'Japanese yen',
  KRW: 'South Korean won',
  HKD: 'Hong Kong dollar',
  SGD: 'Singapore dollar',
  THB: 'Thai baht',
  MYR: 'Malaysian ringgit',
  IDR: 'Indonesian rupiah',
  VND: 'Vietnamese dong',
  BDT: 'Bangladeshi taka',
  KZT: 'Kazakhstani tenge',
  AUD: 'Australian dollar',
  NZD: 'New Zealand dollar',
  AED: 'UAE dirham',
  SAR: 'Saudi riyal',
  ILS: 'Israeli shekel',
  LBP: 'Lebanese pound',
  EGP: 'Egyptian pound',
  DZD: 'Algerian dinar',
  TND: 'Tunisian dinar',
  ZAR: 'South African rand',
} as const;

export type Currency = keyof typeof CURRENCY_NAMES;

export const CURRENCIES = Object.keys(CURRENCY_NAMES) as Currency[];

/** Whether a code — from a shop's page, say — is one the site takes. */
export function isCurrency(value: string | null | undefined): value is Currency {
  return typeof value === 'string' && Object.hasOwn(CURRENCY_NAMES, value.toUpperCase());
}

/** What a pilot starts on until they choose their own. */
export const DEFAULT_HOME_CURRENCY: Currency = 'USD';

/** One of `CURRENCIES`, typed in any case. */
export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(CURRENCIES, { error: 'Choose a currency from the list' }));

/** A currency, or `''` / null for none — what an optional currency field holds. */
export const optionalCurrencySchema = z
  .union([z.literal(''), z.null(), currencySchema])
  .transform((value) => (value === null || value === '' ? null : value));

/**
 * Prices paid in several currencies, added up in one, each at the official
 * rate of the day it was paid.
 */
export const convertedTotalSchema = z.object({
  currency: z.string(),
  /** Null when some price could not be converted. */
  amount: z.number().nullable(),
  /** False while some price uses a nearby day's rate until its own is fetched. */
  exact: z.boolean(),
  /** The latest day whose rates went in; null when no rate was needed. */
  ratesOn: z.string().nullable(),
});

export type ConvertedTotalDto = z.output<typeof convertedTotalSchema>;

/** The currencies a viewer's totals are given in: their own, then USD. */
export function totalCurrencies(homeCurrency: string): string[] {
  return homeCurrency === 'USD' ? ['USD'] : [homeCurrency, 'USD'];
}

/** Setting the currency a pilot's totals are shown in. */
export const updateHomeCurrencySchema = z.object({ homeCurrency: currencySchema });

export type UpdateHomeCurrencyDto = z.output<typeof updateHomeCurrencySchema>;
