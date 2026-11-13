import { Injector, runInInjectionContext } from '@angular/core';
import {
  type AdminUserDto,
  type AppSettingsDto,
  type HiddenCommentDto,
  type HiddenCountDto,
  type HiddenPostDto,
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
        postCount: 2,
        hiddenPostCount: 0,
      },
    ];
    posts: HiddenPostDto[] = [
      {
        id: 'p1',
        title: 'Spam',
        slug: 'spam',
        authorName: 'Pilot',
        hiddenAt: '2026-11-12T00:00:00.000Z',
      },
    ];
    comments: HiddenCommentDto[] = [
      {
        id: 'c1',
        excerpt: 'Buy now',
        authorName: 'Pilot',
        place: { kind: ReportPlaceKind.Spot, id: 's1', slug: null },
        hiddenAt: '2026-11-12T00:00:00.000Z',
      },
    ];
    moderated: string[] = [];
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

    hiddenPosts(): Observable<HiddenPostDto[]> {
      return of(this.posts);
    }

    hiddenComments(): Observable<HiddenCommentDto[]> {
      return of(this.comments);
    }

    setPostHidden(id: string, hidden: boolean): Observable<unknown> {
      return this.record(`post ${id} ${String(hidden)}`);
    }

    deletePost(id: string): Observable<unknown> {
      return this.record(`delete post ${id}`);
    }

    setCommentHidden(id: string, hidden: boolean): Observable<unknown> {
      return this.record(`comment ${id} ${String(hidden)}`);
    }

    deleteComment(id: string): Observable<unknown> {
      return this.record(`delete comment ${id}`);
    }

    setPilotPostsHidden(userId: string, hidden: boolean): Observable<HiddenCountDto> {
      if (this.fails) {
        return throwError(() => new Error('forbidden'));
      }

      this.moderated.push(`pilot ${userId} ${String(hidden)}`);
      this.pilots = this.pilots.map((user) =>
        user.id === userId
          ? { ...user, hiddenPostCount: hidden ? user.postCount : 0 }
          : user,
      );
      return of({ count: 2 });
    }

    private record(call: string): Observable<unknown> {
      if (this.fails) {
        return throwError(() => new Error('forbidden'));
      }

      this.moderated.push(call);
      return of(null);
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

  describe('hidden posts and comments', () => {
    it('load with the rest of the page', () => {
      expect(store.hiddenPosts().map((post) => post.id)).toEqual(['p1']);
      expect(store.hiddenComments().map((comment) => comment.id)).toEqual(['c1']);
    });

    it('leave the list once shown again or deleted', async () => {
      expect(await store.showPost('p1')).toBe(true);
      expect(await store.deleteComment('c1')).toBe(true);

      expect(api.moderated).toEqual(['post p1 false', 'delete comment c1']);
      expect(store.hiddenPosts()).toEqual([]);
      expect(store.hiddenComments()).toEqual([]);
    });

    it('stay on the list when the call fails', async () => {
      api.fails = true;

      expect(await store.deletePost('p1')).toBe(false);
      expect(await store.showComment('c1')).toBe(false);
      expect(store.hiddenPosts()).toHaveLength(1);
      expect(store.hiddenComments()).toHaveLength(1);
      expect(store.saving()).toBe(false);
    });

    it('hiding every post a pilot wrote reads the pilots again, with their new count', async () => {
      expect(await store.setPilotPostsHidden('u1', true)).toBe(2);
      expect(store.users()[0].hiddenPostCount).toBe(2);

      api.fails = true;
      expect(await store.setPilotPostsHidden('u1', false)).toBeNull();
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
