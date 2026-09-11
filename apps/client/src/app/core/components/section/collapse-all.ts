import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { SectionGroup } from './section-group';

/**
 * Folds or unfolds every section on the page at once.
 *
 * Finds the page's `SectionGroup` through DI, so it takes no inputs: place it
 * anywhere under a container that declares `hostDirectives: [SectionGroup]`.
 * With fewer than two sections it would do nothing a heading click cannot, so
 * it stays hidden.
 */
@Component({
  selector: 'sh-collapse-all',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './collapse-all.html',
  styleUrl: './collapse-all.scss',
})
export class CollapseAll {
  protected readonly group = inject(SectionGroup);

  protected toggle(): void {
    this.group.setAll(!this.group.allOpen());
  }
}
