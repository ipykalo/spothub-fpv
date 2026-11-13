import { TextFieldModule } from '@angular/cdk/text-field';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  MAX_REPORT_DETAILS,
  type ReportReason,
  type ReportWordsDto,
  reportWordsSchema,
} from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { REPORT_REASON_OPTIONS } from '../../report-reasons';

/**
 * Presenter: why a post or a comment should not be here — a reason, and a few
 * words, which "Something else" needs. Checked with the schema the API uses,
 * and handed up; it never sends anything itself.
 */
@Component({
  selector: 'sh-report-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Autocomplete,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    TextFieldModule,
  ],
  templateUrl: './report-form.html',
  styleUrl: './report-form.scss',
})
export class ReportForm {
  /** What is being reported, for the heading: "post" or "comment". */
  readonly noun = input('post');
  readonly saving = input(false);

  readonly submitted = output<ReportWordsDto>();
  readonly cancelled = output();

  protected readonly reasons = REPORT_REASON_OPTIONS;
  protected readonly maxLength = MAX_REPORT_DETAILS;
  protected readonly form = new FormGroup({
    reason: new FormControl<ReportReason | null>(null),
    details: new FormControl('', { nonNullable: true }),
  });
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    const { reason, details } = this.form.getRawValue();

    if (reason === null) {
      this.error.set('Choose a reason');
      return;
    }

    const parsed = reportWordsSchema.safeParse({ reason, details });

    if (!parsed.success) {
      this.error.set(parsed.error.issues[0]?.message ?? 'Check what you wrote');
      return;
    }

    this.error.set(null);
    this.submitted.emit(parsed.data);
  }
}
