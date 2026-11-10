import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { USER_STATUS_LABELS, type UserStatus, countryName } from '@spothub/shared';

import { Section } from '../../../core/components/section/section';
import { formatBytes } from '../../../core/format/bytes';
import { AdminStore } from '../admin.store';
import { PilotsTable } from '../presenters/pilots-table/pilots-table';
import { RestrictedCountries } from '../presenters/restricted-countries/restricted-countries';
import { SignUpSettings } from '../presenters/sign-up-settings/sign-up-settings';

/**
 * Container: the Admin page — who may sign in, and the pilots who have. Each
 * change is saved the moment it is made and needs no restart.
 */
@Component({
  selector: 'sh-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatProgressBarModule,
    PilotsTable,
    RestrictedCountries,
    Section,
    SignUpSettings,
  ],
  templateUrl: './admin.page.html',
  styleUrl: './admin.page.scss',
})
export class AdminPage {
  protected readonly store = inject(AdminStore);
  private readonly snackBar = inject(MatSnackBar);

  constructor() {
    void this.store.load();
  }

  protected async setOpen(open: boolean): Promise<void> {
    const saved = await this.store.setOpenRegistration(open);
    this.tell(
      saved,
      open ? 'Sign-up is open to anyone' : 'Sign-up is closed to the list',
    );
  }

  protected async add(email: string): Promise<void> {
    this.tell(await this.store.addEmail(email), `${email} can sign in`);
  }

  protected async remove(email: string): Promise<void> {
    this.tell(await this.store.removeEmail(email), `${email} removed`);
  }

  protected async restrictCountry(code: string): Promise<void> {
    this.tell(
      await this.store.addBlockedCountry(code),
      `Nobody can sign in from ${countryName(code)} now`,
    );
  }

  protected async allowCountry(code: string): Promise<void> {
    this.tell(
      await this.store.removeBlockedCountry(code),
      `Sign-in from ${countryName(code)} is allowed again`,
    );
  }

  protected async setStatus(change: { id: string; status: UserStatus }): Promise<void> {
    this.tell(
      await this.store.updateUser(change.id, { status: change.status }),
      `${this.nameOf(change.id)}: ${USER_STATUS_LABELS[change.status]}`,
    );
  }

  protected async setLimit(change: { id: string; bytes: number | null }): Promise<void> {
    this.tell(
      await this.store.updateUser(change.id, { storageQuotaBytes: change.bytes }),
      change.bytes === null
        ? `${this.nameOf(change.id)} is back on the default limit`
        : `${this.nameOf(change.id)} may now use ${formatBytes(change.bytes)}`,
    );
  }

  protected async setDefaultLimit(bytes: number): Promise<void> {
    const saved = await this.store.setDefaultStorageLimit(bytes);

    // Every pilot on the default has a new limit: read the list again.
    if (saved) {
      await this.store.load();
    }

    this.tell(saved, `Each pilot may now use ${formatBytes(bytes)} by default`);
  }

  private nameOf(id: string): string {
    const user = this.store.users().find((entry) => entry.id === id);
    return user?.displayName ?? user?.email ?? 'Pilot';
  }

  private tell(saved: boolean, done: string): void {
    this.snackBar.open(saved ? done : 'Could not save that change', undefined, {
      duration: saved ? 2500 : 4000,
    });
  }
}
