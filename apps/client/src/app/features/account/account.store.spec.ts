import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import type { StorageUsageDto } from '@spothub/shared';
import { type Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';

import { AccountApi } from './account.api';
import { AccountStore } from './account.store';

/** The pilot's own account: their storage, and deleting it for good. */
describe('AccountStore', () => {
  class FakeApi {
    storageFails = false;
    deleteFails: HttpErrorResponse | null = null;
    deleted = 0;

    storage(): Observable<StorageUsageDto> {
      return this.storageFails
        ? throwError(() => new Error('offline'))
        : of({ usedBytes: 50, limitBytes: 200 });
    }

    deleteAccount(): Observable<void> {
      if (this.deleteFails) {
        return throwError(() => this.deleteFails);
      }

      this.deleted += 1;
      return of(undefined);
    }
  }

  let api: FakeApi;
  let store: AccountStore;

  beforeEach(() => {
    api = new FakeApi();
    const injector = Injector.create({
      providers: [{ provide: AccountApi, useValue: api }],
    });
    store = runInInjectionContext(injector, () => new AccountStore());
  });

  it('reads how much room the pilot uses', async () => {
    await store.load();

    expect(store.storage()).toEqual({ usedBytes: 50, limitBytes: 200 });
  });

  it('leaves the usage unknown rather than failing the page', async () => {
    api.storageFails = true;

    await store.load();

    expect(store.storage()).toBeNull();
  });

  it('deletes the account', async () => {
    expect(await store.deleteAccount()).toBe(true);

    expect(api.deleted).toBe(1);
    expect(store.deleting()).toBe(false);
  });

  it('says why when the API refuses, as it does the only admin', async () => {
    api.deleteFails = new HttpErrorResponse({
      status: 409,
      error: { message: 'You are the only admin.' },
    });

    expect(await store.deleteAccount()).toBe(false);
    expect(store.error()).toBe('You are the only admin.');
  });
});
