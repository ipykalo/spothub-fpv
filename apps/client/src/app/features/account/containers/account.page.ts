import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { Currency } from '@spothub/shared';

import { AuthStore } from '../../../core/auth/auth.store';
import { AccountStore } from '../account.store';
import { AccountDetails } from '../presenters/account-details/account-details';
import { PilotNameForm } from '../presenters/pilot-name-form/pilot-name-form';
import { HomeCurrencyForm } from '../presenters/home-currency-form/home-currency-form';
import { SignOutEverywhere } from '../presenters/sign-out-everywhere/sign-out-everywhere';

/**
 * Container: the signed-in pilot's own account. Deleting it ends the session
 * here too and lands on the blog, which is all a visitor has.
 */
@Component({
  selector: 'sh-account-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AccountDetails, HomeCurrencyForm, PilotNameForm, SignOutEverywhere],
  templateUrl: './account.page.html',
  styleUrl: './account.page.scss',
})
export class AccountPage {
  protected readonly auth = inject(AuthStore);
  protected readonly store = inject(AccountStore);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly signingOut = signal(false);
  protected readonly signOutError = signal<string | null>(null);

  constructor() {
    void this.store.load();
  }

  protected async savePilotName(pilotName: string | null): Promise<void> {
    const saved = await this.store.setPilotName(pilotName);

    if (saved) {
      this.auth.applyPilotName(saved);
      this.snackBar.open(
        `Others now see you as ${saved.publicName ?? 'a pilot'}.`,
        undefined,
        {
          duration: 4000,
        },
      );
    }
  }

  protected async saveHomeCurrency(currency: Currency): Promise<void> {
    const saved = await this.store.setHomeCurrency(currency);

    if (saved) {
      this.auth.applyHomeCurrency(saved);
      this.snackBar.open(`Totals are now shown in ${saved} and USD.`, undefined, {
        duration: 4000,
      });
    }
  }

  protected async delete(): Promise<void> {
    if (!(await this.store.deleteAccount())) {
      return;
    }

    // The account and its sessions are gone on the server; forget it here.
    this.auth.forget();
    await this.router.navigateByUrl('/');
    this.snackBar.open('Your account and everything in it were deleted.', undefined, {
      duration: 6000,
    });
  }

  protected async signOutEverywhere(): Promise<void> {
    this.signingOut.set(true);
    this.signOutError.set(null);
    const done = await this.auth.logoutEverywhere();
    this.signingOut.set(false);

    if (!done) {
      this.signOutError.set(
        'Could not sign out: the server did not answer. Check your connection and try again.',
      );
      return;
    }

    await this.router.navigateByUrl('/login');
    this.snackBar.open('Signed out on every device.', undefined, { duration: 5000 });
  }
}
