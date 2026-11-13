import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { ReportSubject, ReportWordsDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { apiMessage } from '../../../../core/api/api-error';
import { AuthStore } from '../../../../core/auth/auth.store';
import { ReportForm } from '../../presenters/report-form/report-form';
import { ReportsApi } from '../../reports.api';

/**
 * Container: "Report" on something someone else wrote — a post, for now —
 * opening the report form in place and sending what it hands up. Shown only
 * to a signed-in reader; the page leaves it out on the reader's own words.
 */
@Component({
  selector: 'sh-report-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, ReportForm],
  templateUrl: './report-button.html',
  styleUrl: './report-button.scss',
})
export class ReportButton {
  readonly subject = input.required<ReportSubject>();
  readonly subjectId = input.required<string>();
  /** What it is called in the form: "post" or "comment". */
  readonly noun = input('post');

  protected readonly auth = inject(AuthStore);
  private readonly api = inject(ReportsApi);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly open = signal(false);
  protected readonly saving = signal(false);

  protected async send(words: ReportWordsDto): Promise<void> {
    this.saving.set(true);

    try {
      await firstValueFrom(
        this.api.file({ ...words, subject: this.subject(), subjectId: this.subjectId() }),
      );
      this.open.set(false);
      this.snackBar.open('Reported. Thank you — an admin will look at it.', undefined, {
        duration: 4000,
      });
    } catch (error) {
      this.snackBar.open(apiMessage(error, 'The report did not go through.'), undefined, {
        duration: 4000,
      });
    } finally {
      this.saving.set(false);
    }
  }
}
