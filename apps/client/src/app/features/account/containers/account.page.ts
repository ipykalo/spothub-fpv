import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { AuthStore } from '../../../core/auth/auth.store';
import { AccountStore } from '../account.store';
import { AccountDetails } from '../presenters/account-details/account-details';

/**
 * Container: the signed-in pilot's own account. Deleting it ends the session
 * here too and lands on the blog, which is all a visitor has.
 */
@Component({
  selector: 'sh-account-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AccountDetails],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
})
export class AccountPage {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(AccountStore);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  constructor() {
    void this.store.load();
  }

  protected async delete(): Promise<void> {
    if (!(await this.store.deleteAccount())) {
      return;
    }

    // The account and its sessions are gone on the server; forget it here.
    await this.auth.logout();
    await this.router.navigateByUrl('/');
    this.snackBar.open('Your account and everything in it were deleted.', undefined, {
      duration: 6000,
    });
  }
}
