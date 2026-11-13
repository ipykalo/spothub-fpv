import { Injectable, type WritableSignal, inject, signal } from '@angular/core';
import {
  type AdminUserDto,
  type AppSettingsDto,
  type CountryCode,
  type HiddenCommentDto,
  type HiddenPostDto,
  type ReportDto,
  type UpdateAdminUserDto,
  type UpdateAppSettingsDto,
  isCountryCode,
} from '@spothub/shared';
import { type Observable, firstValueFrom } from 'rxjs';

import { AdminApi } from './admin.api';

/**
 * Signal-backed state for the Admin page: who may sign in, the pilots, the
 * open reports, and the posts and comments an admin has hidden.
 *
 * Every change is saved at once and the page shows what the API answered, so
 * what is on screen is always what the next sign-in will be judged by.
 */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  private readonly api = inject(AdminApi);

  private readonly current = signal<AppSettingsDto | null>(null);
  private readonly pilots = signal<readonly AdminUserDto[]>([]);
  private readonly openReports = signal<readonly ReportDto[]>([]);
  private readonly posts = signal<readonly HiddenPostDto[]>([]);
  private readonly comments = signal<readonly HiddenCommentDto[]>([]);
  private readonly busy = signal(false);
  private readonly writing = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly settings = this.current.asReadonly();
  readonly users = this.pilots.asReadonly();
  readonly reports = this.openReports.asReadonly();
  readonly hiddenPosts = this.posts.asReadonly();
  readonly hiddenComments = this.comments.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly saving = this.writing.asReadonly();
  readonly error = this.failure.asReadonly();

  async load(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      const [settings, users, reports, posts, comments] = await Promise.all([
        firstValueFrom(this.api.settings()),
        firstValueFrom(this.api.users()),
        firstValueFrom(this.api.reports()),
        firstValueFrom(this.api.hiddenPosts()),
        firstValueFrom(this.api.hiddenComments()),
      ]);
      this.current.set(settings);
      this.pilots.set(users);
      this.openReports.set(reports);
      this.posts.set(posts);
      this.comments.set(comments);
    } catch {
      this.failure.set('Could not load the settings.');
    } finally {
      this.busy.set(false);
    }
  }

  setOpenRegistration(open: boolean): Promise<boolean> {
    return this.save({ openRegistration: open });
  }

  /** Adds an address to the list. One already on it is not added twice. */
  addEmail(email: string): Promise<boolean> {
    const address = email.trim().toLowerCase();
    const list = this.current()?.allowedEmails ?? [];

    if (list.includes(address)) {
      return Promise.resolve(true);
    }

    return this.save({ allowedEmails: [...list, address] });
  }

  removeEmail(email: string): Promise<boolean> {
    const list = this.current()?.allowedEmails ?? [];
    return this.save({ allowedEmails: list.filter((entry) => entry !== email) });
  }

  /** Adds a country nobody but an admin may sign in from. */
  addBlockedCountry(code: string): Promise<boolean> {
    const list = this.blocked();

    if (!isCountryCode(code) || list.includes(code)) {
      return Promise.resolve(isCountryCode(code));
    }

    return this.save({ blockedCountries: [...list, code] });
  }

  removeBlockedCountry(code: string): Promise<boolean> {
    return this.save({
      blockedCountries: this.blocked().filter((entry) => entry !== code),
    });
  }

  private blocked(): CountryCode[] {
    return (this.current()?.blockedCountries ?? []).filter(isCountryCode);
  }

  /** What each pilot may keep unless given their own limit. */
  setDefaultStorageLimit(bytes: number): Promise<boolean> {
    return this.save({ defaultStorageQuotaBytes: bytes });
  }

  /**
   * A pilot's status or own storage limit (null puts them back on the
   * default). True once saved; the row then shows what the API answered.
   */
  async updateUser(id: string, change: UpdateAdminUserDto): Promise<boolean> {
    this.writing.set(true);

    try {
      const updated = await firstValueFrom(this.api.updateUser(id, change));
      this.pilots.update((users) =>
        users.map((user) => (user.id === updated.id ? updated : user)),
      );
      return true;
    } catch {
      return false;
    } finally {
      this.writing.set(false);
    }
  }

  /**
   * Closes a report — and the others about the same post or comment, which
   * the list the API answers with no longer holds. True once closed.
   */
  async resolveReport(id: string): Promise<boolean> {
    this.writing.set(true);

    try {
      this.openReports.set(await firstValueFrom(this.api.resolveReport(id)));
      return true;
    } catch {
      return false;
    } finally {
      this.writing.set(false);
    }
  }

  /** Shows a hidden post to everyone again. True once done. */
  showPost(id: string): Promise<boolean> {
    return this.moderate(this.api.setPostHidden(id, false), this.posts, id);
  }

  /** Deletes a hidden post for good. True once done. */
  deletePost(id: string): Promise<boolean> {
    return this.moderate(this.api.deletePost(id), this.posts, id);
  }

  showComment(id: string): Promise<boolean> {
    return this.moderate(this.api.setCommentHidden(id, false), this.comments, id);
  }

  deleteComment(id: string): Promise<boolean> {
    return this.moderate(this.api.deleteComment(id), this.comments, id);
  }

  /**
   * Hides, or shows again, every post a pilot wrote. The pilots' counts and
   * the hidden list both change, so both are read again. How many changed,
   * or null when it failed.
   */
  async setPilotPostsHidden(userId: string, hidden: boolean): Promise<number | null> {
    this.writing.set(true);

    try {
      const { count } = await firstValueFrom(
        this.api.setPilotPostsHidden(userId, hidden),
      );
      const [users, posts] = await Promise.all([
        firstValueFrom(this.api.users()),
        firstValueFrom(this.api.hiddenPosts()),
      ]);
      this.pilots.set(users);
      this.posts.set(posts);
      return count;
    } catch {
      return null;
    } finally {
      this.writing.set(false);
    }
  }

  /** One moderation call; once it has answered, the entry leaves its hidden list. */
  private async moderate<T extends { readonly id: string }>(
    call: Observable<unknown>,
    list: WritableSignal<readonly T[]>,
    id: string,
  ): Promise<boolean> {
    this.writing.set(true);

    try {
      await firstValueFrom(call);
      list.update((entries) => entries.filter((entry) => entry.id !== id));
      return true;
    } catch {
      return false;
    } finally {
      this.writing.set(false);
    }
  }

  /** True once saved. A failure leaves the settings as they were on screen. */
  private async save(change: UpdateAppSettingsDto): Promise<boolean> {
    this.writing.set(true);

    try {
      this.current.set(await firstValueFrom(this.api.updateSettings(change)));
      return true;
    } catch {
      return false;
    } finally {
      this.writing.set(false);
    }
  }
}
