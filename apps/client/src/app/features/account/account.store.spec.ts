import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import type {
  PilotNameDto,
  PilotPhotoDto,
  RequestUploadDto,
  StorageUsageDto,
  UpdateHomeCurrencyDto,
  UpdatePilotNameDto,
  UploadTicketDto,
} from '@spothub/shared';
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

    nameFails: HttpErrorResponse | null = null;
    namesSent: UpdatePilotNameDto[] = [];

    setPilotName(body: UpdatePilotNameDto): Observable<PilotNameDto> {
      this.namesSent.push(body);
      return this.nameFails
        ? throwError(() => this.nameFails)
        : of({ pilotName: body.pilotName, publicName: body.pilotName ?? 'Ivan P.' });
    }

    currencyFails = false;

    setHomeCurrency(body: UpdateHomeCurrencyDto): Observable<UpdateHomeCurrencyDto> {
      return this.currencyFails ? throwError(() => new Error('offline')) : of(body);
    }

    photoFails: HttpErrorResponse | null = null;
    photoCalls: string[] = [];

    requestPhotoUpload(body: RequestUploadDto): Observable<UploadTicketDto> {
      this.photoCalls.push(`ticket ${body.mime} ${String(body.sizeBytes)}`);
      return of({
        assetId: 'a1',
        uploadUrl: 'https://storage/put',
        contentType: body.mime,
        expiresInSeconds: 300,
      });
    }

    putPhoto(ticket: UploadTicketDto): Observable<null> {
      this.photoCalls.push(`put ${ticket.uploadUrl}`);
      return of(null);
    }

    commitPhoto(assetId: string): Observable<PilotPhotoDto> {
      this.photoCalls.push(`commit ${assetId}`);
      return this.photoFails
        ? throwError(() => this.photoFails)
        : of({ photoUrl: `/api/users/u1/photo?v=${assetId}` });
    }

    removePhoto(): Observable<PilotPhotoDto> {
      this.photoCalls.push('remove');
      return of({ photoUrl: null });
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

  it('saves a pilot name, and clears it with null', async () => {
    expect(await store.setPilotName('Sky Ninja')).toEqual({
      pilotName: 'Sky Ninja',
      publicName: 'Sky Ninja',
    });
    expect(await store.setPilotName(null)).toEqual({
      pilotName: null,
      publicName: 'Ivan P.',
    });
    expect(api.namesSent).toEqual([{ pilotName: 'Sky Ninja' }, { pilotName: null }]);
    expect(store.savingName()).toBe(false);
    expect(store.nameError()).toBeNull();
  });

  it('says why a pilot name was refused', async () => {
    api.nameFails = new HttpErrorResponse({
      status: 400,
      error: { message: 'At most 32 characters' },
    });

    expect(await store.setPilotName('x'.repeat(40))).toBeNull();
    expect(store.nameError()).toBe('At most 32 characters');
  });

  it('saves a home currency, and says so when it could not', async () => {
    expect(await store.setHomeCurrency('UAH')).toBe('UAH');
    expect(store.currencyError()).toBeNull();

    api.currencyFails = true;
    expect(await store.setHomeCurrency('EUR')).toBeNull();
    expect(store.currencyError()).toBe(
      'Your home currency could not be saved. Try again.',
    );
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

  describe('profile photo', () => {
    const file = (type: string): File => new File(['bytes'], 'me.jpg', { type });

    it('asks for a ticket, puts the bytes straight to storage, then commits', async () => {
      expect(await store.uploadPhoto(file('image/jpeg'))).toEqual({
        photoUrl: '/api/users/u1/photo?v=a1',
      });
      expect(api.photoCalls).toEqual([
        'ticket image/jpeg 5',
        'put https://storage/put',
        'commit a1',
      ]);
      expect(store.savingPhoto()).toBe(false);
    });

    it('refuses what is not an image before sending anything', async () => {
      expect(await store.uploadPhoto(file('application/pdf'))).toBeNull();
      expect(store.photoError()).toBe('Choose a JPEG, PNG, WebP or AVIF image.');
      expect(api.photoCalls).toEqual([]);
    });

    it('says why the server refused, in its words', async () => {
      api.photoFails = new HttpErrorResponse({
        status: 413,
        error: { message: 'Your storage is full' },
      });

      expect(await store.uploadPhoto(file('image/png'))).toBeNull();
      expect(store.photoError()).toBe('Your storage is full');
    });

    it('removes it', async () => {
      expect(await store.removePhoto()).toEqual({ photoUrl: null });
      expect(api.photoCalls).toEqual(['remove']);
    });
  });
});
