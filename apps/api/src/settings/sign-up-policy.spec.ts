import { describe, expect, it } from 'vitest';

import { permitsSignIn } from './sign-up-policy';

/** The gate on sign-up: one switch opens it, otherwise the list decides. */
describe('permitsSignIn', () => {
  const closed = { openRegistration: false, allowedEmails: ['pilot@example.com'] };

  it('lets in only the listed addresses while sign-up is closed, whatever their case', () => {
    expect(permitsSignIn(closed, 'pilot@example.com')).toBe(true);
    expect(permitsSignIn(closed, 'Pilot@Example.com')).toBe(true);
    expect(permitsSignIn(closed, 'stranger@example.com')).toBe(false);
  });

  it('lets in anyone once sign-up is open', () => {
    expect(
      permitsSignIn(
        { openRegistration: true, allowedEmails: [] },
        'stranger@example.com',
      ),
    ).toBe(true);
  });

  it('lets in nobody with an empty list and sign-up closed', () => {
    expect(
      permitsSignIn({ openRegistration: false, allowedEmails: [] }, 'pilot@example.com'),
    ).toBe(false);
  });

  it('does not treat "*" on the list as open sign-up', () => {
    expect(
      permitsSignIn(
        { openRegistration: false, allowedEmails: ['*'] },
        'stranger@example.com',
      ),
    ).toBe(false);
  });
});
