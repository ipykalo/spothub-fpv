import { Injector, runInInjectionContext } from '@angular/core';
import type { AppSettingsDto, UpdateAppSettingsDto } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AdminApi } from './admin.api';
import { AdminStore } from './admin.store';

/**
 * Who may sign in. Every change is saved at once, and the screen shows what
 * the API answered — so a failed save must leave the list as it was.
 */
describe('AdminStore', () => {
  class FakeApi {
    stored: AppSettingsDto = {
      openRegistration: false,
      allowedEmails: ['pilot@example.com'],
      updatedAt: '2026-11-10T00:00:00.000Z',
    };
    sent: UpdateAppSettingsDto[] = [];
    fails = false;

    settings(): Observable<AppSettingsDto> {
      return this.fails ? throwError(() => new Error('offline')) : of(this.stored);
    }

    updateSettings(body: UpdateAppSettingsDto): Observable<AppSettingsDto> {
      this.sent.push(body);

      if (this.fails) {
        return throwError(() => new Error('forbidden'));
      }

      this.stored = { ...this.stored, ...body };
      return of(this.stored);
    }
  }

  let api: FakeApi;
  let store: AdminStore;

  beforeEach(async () => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: AdminApi, useValue: api }],
    });
    store = runInInjectionContext(injector, () => new AdminStore());
    await store.load();
  });

  it('loads the settings as they stand', () => {
    expect(store.settings()?.allowedEmails).toEqual(['pilot@example.com']);
    expect(store.loading()).toBe(false);
  });

  it('says what went wrong when the settings cannot be read', async () => {
    api.fails = true;

    await store.load();

    expect(store.error()).toBe('Could not load the settings.');
  });

  it('opens sign-up with the switch alone, leaving the list out of the request', async () => {
    expect(await store.setOpenRegistration(true)).toBe(true);

    expect(api.sent).toEqual([{ openRegistration: true }]);
    expect(store.settings()?.openRegistration).toBe(true);
  });

  it('adds an address to the end of the list, tidied, and never twice', async () => {
    await store.addEmail('  Friend@Example.com ');
    await store.addEmail('friend@example.com');

    expect(api.sent).toEqual([
      { allowedEmails: ['pilot@example.com', 'friend@example.com'] },
    ]);
    expect(store.settings()?.allowedEmails).toEqual([
      'pilot@example.com',
      'friend@example.com',
    ]);
  });

  it('removes an address', async () => {
    await store.removeEmail('pilot@example.com');

    expect(store.settings()?.allowedEmails).toEqual([]);
  });

  it('keeps the list as it was when a save fails, and says so', async () => {
    api.fails = true;

    expect(await store.removeEmail('pilot@example.com')).toBe(false);
    expect(store.settings()?.allowedEmails).toEqual(['pilot@example.com']);
    expect(store.saving()).toBe(false);
  });
});
