import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { REPORT_REASON_LABELS, type ReportDto, ReportSubject } from '@spothub/shared';

import { reportLink } from '../../report-link';

/**
 * Presenter: the open reports, newest first — what was reported, whose it
 * is, why, and by whom — each with a link to where it is and a Dismiss that
 * closes it, along with every other report about the same thing.
 */
@Component({
  selector: 'sh-reports-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './reports-list.html',
  styleUrl: './reports-list.scss',
})
export class ReportsList {
  readonly reports = input.required<readonly ReportDto[]>();
  readonly saving = input(false);

  readonly dismissed = output<ReportDto>();

  protected readonly reasons = REPORT_REASON_LABELS;
  protected readonly link = reportLink;

  protected what(report: ReportDto): string {
    return report.subject === ReportSubject.Post ? 'Post' : 'Comment';
  }
}
