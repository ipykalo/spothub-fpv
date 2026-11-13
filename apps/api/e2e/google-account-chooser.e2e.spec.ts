import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type TestApp, createTestApp } from './support/app';

/**
 * Signing in always asks which Google account. Without `prompt=select_account`
 * Google continues with whichever account the browser is signed in to, so
 * after signing out a pilot could never pick a different one.
 */
describe('Google account chooser', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('sends the pilot to Google asking for the account chooser', async () => {
    const response = await request(testApp.server).get('/api/auth/google').expect(302);
    const location = new URL(response.headers['location'] ?? '');

    expect(location.hostname).toBe('accounts.google.com');
    expect(location.searchParams.get('prompt')).toBe('select_account');
    expect(location.searchParams.get('scope')).toBe('email profile');
  });
});
