import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import type { Env } from '../../config';
import { AllowlistService } from './allowlist.service';

/** The gate on sign-up: one switch opens it, otherwise the list decides. */
describe('AllowlistService', () => {
  const gate = (allowed: string[], open: boolean): AllowlistService => {
    const values: Partial<Env> = { ALLOWED_EMAILS: allowed, OPEN_REGISTRATION: open };
    const config = {
      get: (key: keyof Env) => values[key],
    } as unknown as ConfigService<Env, true>;

    return new AllowlistService(config);
  };

  it('lets in only the listed addresses while sign-up is closed, whatever their case', () => {
    const allowlist = gate(['pilot@example.com'], false);

    expect(allowlist.permits('pilot@example.com')).toBe(true);
    expect(allowlist.permits('Pilot@Example.com')).toBe(true);
    expect(allowlist.permits('stranger@example.com')).toBe(false);
  });

  it('lets in anyone once sign-up is open', () => {
    const allowlist = gate([], true);

    expect(allowlist.permits('stranger@example.com')).toBe(true);
  });

  it('lets in nobody with an empty list and sign-up closed', () => {
    expect(gate([], false).permits('pilot@example.com')).toBe(false);
  });

  it('no longer treats "*" in the list as open sign-up', () => {
    expect(gate(['*'], false).permits('stranger@example.com')).toBe(false);
  });
});
