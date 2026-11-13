import { Injector, runInInjectionContext } from '@angular/core';
import {
  type AdminUserDto,
  type AppSettingsDto,
  type ReportDto,
  ReportPlaceKind,
  ReportReason,
  ReportSubject,
  Role,
  type UpdateAdminUserDto,
  type UpdateAppSettingsDto,
  UserStatus,
} from '@spothub/shared';
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
      defaultStorageQuotaBytes: 2048,
      blockedCountries: ['RU'],
      updatedAt: '2026-11-10T00:00:00.000Z',
    };
    sent: UpdateAppSettingsDto[] = [];
    pilots: AdminUserDto[] = [
      {
        id: 'u1',
        email: 'pilot@example.com',
        displayName: 'Pilot',
        avatarUrl: null,
        role: Role.User,
        status: UserStatus.Active,
        isViewer: false,
        createdAt: '2026-11-01T00:00:00.000Z',
        lastSignInAt: null,
        storageUsedBytes: 0,
        storageLimitBytes: 2048,
        storageQuotaBytes: null,
        lastSignInCountry: null,
      },
    ];
    openReports: ReportDto[] = [
      report('r1', 'c1'),
      report('r2', 'c1'),
      report('r3', 'c2'),
    ];
    fails = false;

    reports(): Observable<ReportDto[]> {
      return of(this.openReports);
    }

    resolveReport(id: string): Observable<ReportDto[]> {
      if (this.fails) {
        return throwError(() => new Error('forbidden'));
      }

      const about = this.openReports.find((entry) => entry.id === id)?.excerpt;
      this.openReports = this.openReports.filter((entry) => entry.excerpt !== about);
      return of(this.openReports);
    }

    settings(): Observable<AppSettingsDto> {
      return this.fails ? throwError(() => new Error('offline')) : of(this.stored);
    }

    users(): Observable<AdminUserDto[]> {
      return of(this.pilots);
    }

    updateUser(id: string, body: UpdateAdminUserDto): Observable<AdminUserDto> {
      if (this.fails) {
        return throwError(() => new Error('forbidden'));
      }

      const user = this.pilots.find((entry) => entry.id === id) ?? this.pilots[0];
      return of({ ...user, ...body });
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

  it('loads the settings and the pilots', () => {
    expect(store.settings()?.allowedEmails).toEqual(['pilot@example.com']);
    expect(store.users().map((user) => user.id)).toEqual(['u1']);
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

  it('shows a pilot’s new status once the API has it', async () => {
    expect(await store.updateUser('u1', { status: UserStatus.Blocked })).toBe(true);

    expect(store.users()[0].status).toBe(UserStatus.Blocked);
  });

  it('gives a pilot their own storage limit', async () => {
    await store.updateUser('u1', { storageQuotaBytes: 4096 });

    expect(store.users()[0].storageQuotaBytes).toBe(4096);
  });

  it('changes the default limit with that setting alone', async () => {
    await store.setDefaultStorageLimit(8192);

    expect(api.sent).toEqual([{ defaultStorageQuotaBytes: 8192 }]);
    expect(store.settings()?.defaultStorageQuotaBytes).toBe(8192);
  });

  it('restricts a country, never twice, and allows it again', async () => {
    expect(await store.addBlockedCountry('IR')).toBe(true);
    expect(await store.addBlockedCountry('IR')).toBe(true);
    expect(await store.addBlockedCountry('XX')).toBe(false);
    expect(store.settings()?.blockedCountries).toEqual(['RU', 'IR']);

    await store.removeBlockedCountry('RU');

    expect(api.sent).toEqual([
      { blockedCountries: ['RU', 'IR'] },
      { blockedCountries: ['IR'] },
    ]);
    expect(store.settings()?.blockedCountries).toEqual(['IR']);
  });

  it('leaves a pilot’s status alone when the change fails', async () => {
    api.fails = true;

    expect(await store.updateUser('u1', { status: UserStatus.Blocked })).toBe(false);
    expect(store.users()[0].status).toBe(UserStatus.Active);
  });

  it('keeps the list as it was when a save fails, and says so', async () => {
    api.fails = true;

    expect(await store.removeEmail('pilot@example.com')).toBe(false);
    expect(store.settings()?.allowedEmails).toEqual(['pilot@example.com']);
    expect(store.saving()).toBe(false);
  });

  describe('reports', () => {
    it('loads the open reports with the rest of the page', async () => {
      await store.load();
      expect(store.reports().map((entry) => entry.id)).toEqual(['r1', 'r2', 'r3']);
    });

    it('closing one drops every report about the same thing, as the API answered', async () => {
      await store.load();
      expect(await store.resolveReport('r1')).toBe(true);
      expect(store.reports().map((entry) => entry.id)).toEqual(['r3']);
    });

    it('a failed close leaves the list as it was', async () => {
      await store.load();
      api.fails = true;
      expect(await store.resolveReport('r1')).toBe(false);
      expect(store.reports()).toHaveLength(3);
    });
  });
});

function report(id: string, about: string): ReportDto {
  return {
    id,
    subject: ReportSubject.Comment,
    reason: ReportReason.Spam,
    details: null,
    reporterName: 'Reporter R.',
    authorName: 'Author A.',
    excerpt: about,
    place: { kind: ReportPlaceKind.Post, id: 'p1', slug: 'a-post' },
    createdAt: '2026-11-13T00:00:00.000Z',
  };
}
