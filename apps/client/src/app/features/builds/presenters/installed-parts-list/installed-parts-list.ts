import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  INSTALL_REASON_LABELS,
  PART_CATEGORY_LABELS,
  type BuildPartDto,
} from '@spothub/shared';

import { PART_CATEGORY_ICONS } from '../../../parts/part-category';
import { unitName as partUnitName } from '../../../parts/part-condition';

/**
 * Presenter: the components on a build. Renders a list and announces intent —
 * it owns no state and never talks to a store.
 */
@Component({
  selector: 'sh-installed-parts-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './installed-parts-list.html',
  styleUrl: './installed-parts-list.scss',
})
export class InstalledPartsList {
  readonly installs = input.required<readonly BuildPartDto[]>();
  /** Past installs render without a remove action and with their end date. */
  readonly history = input(false);
  readonly pendingRemoval = input<string | null>(null);

  readonly removeRequested = output<BuildPartDto>();

  protected readonly categoryLabels = PART_CATEGORY_LABELS;
  protected readonly categoryIcons = PART_CATEGORY_ICONS;
  protected readonly reasonLabels = INSTALL_REASON_LABELS;

  /** Which physical unit this was — "#3", or whatever is written on it. */
  protected unitName(install: BuildPartDto): string {
    return partUnitName(install.part, install.unit);
  }

  /** Manufacturer and model are both optional; fall back to the category. */
  protected name(install: BuildPartDto): string {
    const { manufacturer, model, category } = install.part;
    const named = [manufacturer, model].filter(Boolean).join(' ');

    return named || PART_CATEGORY_LABELS[category];
  }
}
