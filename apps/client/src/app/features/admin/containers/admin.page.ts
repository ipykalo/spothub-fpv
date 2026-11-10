import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { USER_STATUS_LABELS, type UserStatus } from '@spothub/shared';

import { Section } from '../../../core/components/section/section';
import { AdminStore } from '../admin.store';
import { PilotsTable } from '../presenters/pilots-table/pilots-table';
import { SignUpSettings } from '../presenters/sign-up-settings/sign-up-settings';

/**
 * Container: the Admin page — who may sign in, and the pilots who have. Each
 * change is saved the moment it is made and needs no restart.
 */
@Component({
  selector: 'sh-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressBarModule, PilotsTable, Section, SignUpSettings],
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

  protected async setStatus(change: { id: string; status: UserStatus }): Promise<void> {
    const user = this.store.users().find((entry) => entry.id === change.id);
    const name = user?.displayName ?? user?.email ?? 'Pilot';

    this.tell(
      await this.store.setUserStatus(change.id, change.status),
      `${name}: ${USER_STATUS_LABELS[change.status]}`,
    );
  }

  private tell(saved: boolean, done: string): void {
    this.snackBar.open(saved ? done : 'Could not save that change', undefined, {
      duration: saved ? 2500 : 4000,
    });
  }
}
