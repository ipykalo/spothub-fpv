import {
  CURRENCIES,
  currencySchema,
  isCurrency,
  optionalCurrencySchema,
} from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { CURRENCY_OPTIONS } from './currency-options';

describe('currencies', () => {
  it('are the hryvnia and the 40 currencies the NBU publishes, each once', () => {
    expect(CURRENCIES).toHaveLength(41);
    expect(new Set(CURRENCIES).size).toBe(41);
    expect(CURRENCIES.slice(0, 3)).toEqual(['UAH', 'USD', 'EUR']);
    expect(CURRENCIES).toContain('INR');
  });

  it('offer the code as the label and the name as the hint, so either finds it', () => {
    expect(CURRENCY_OPTIONS.find((option) => option.value === 'PLN')).toEqual({
      value: 'PLN',
      label: 'PLN',
      hint: 'Polish złoty',
    });
  });

  it('take a listed code in any case, and nothing else', () => {
    expect(currencySchema.parse(' usd ')).toBe('USD');
    expect(currencySchema.safeParse('EUE').success).toBe(false);
    expect(currencySchema.safeParse('XAU').success).toBe(false);
    expect(currencySchema.safeParse('EUE').error?.issues[0]?.message).toBe(
      'Choose a currency from the list',
    );
  });

  it('read an empty optional currency as none', () => {
    expect(optionalCurrencySchema.parse('')).toBeNull();
    expect(optionalCurrencySchema.parse(null)).toBeNull();
    expect(optionalCurrencySchema.parse('gbp')).toBe('GBP');
  });

  it('tell a shop page’s currency apart from one the site cannot convert', () => {
    expect(isCurrency('usd')).toBe(true);
    expect(isCurrency('BRL')).toBe(false);
    expect(isCurrency(null)).toBe(false);
  });
});
