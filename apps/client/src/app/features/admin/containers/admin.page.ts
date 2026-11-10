import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Section } from '../../../core/components/section/section';
import { AdminStore } from '../admin.store';
import { SignUpSettings } from '../presenters/sign-up-settings/sign-up-settings';

/**
 * Container: the Admin page. Today it holds who may sign in; each change is
 * saved the moment it is made and applies to the next sign-in, no restart.
 */
@Component({
  selector: 'sh-admin-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatProgressBarModule, Section, SignUpSettings],
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

  private tell(saved: boolean, done: string): void {
    this.snackBar.open(saved ? done : 'Could not save that change', undefined, {
      duration: saved ? 2500 : 4000,
    });
  }
}
