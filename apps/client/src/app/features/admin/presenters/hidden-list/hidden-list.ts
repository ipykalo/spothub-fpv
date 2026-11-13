import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { HiddenCommentDto, HiddenPostDto } from '@spothub/shared';

import { reportLink } from '../../report-link';

/**
 * Presenter: what an admin has hidden — posts, then comments — each with Show
 * again and Delete. A hidden post has no link: nobody but its author can open
 * it. A comment links to the page it is under.
 */
@Component({
  selector: 'sh-hidden-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './hidden-list.html',
  styleUrl: './hidden-list.scss',
})
export class HiddenList {
  readonly posts = input.required<readonly HiddenPostDto[]>();
  readonly comments = input.required<readonly HiddenCommentDto[]>();
  readonly saving = input(false);

  readonly postShown = output<HiddenPostDto>();
  readonly postDeleted = output<HiddenPostDto>();
  readonly commentShown = output<HiddenCommentDto>();
  readonly commentDeleted = output<HiddenCommentDto>();

  protected readonly link = reportLink;
}
