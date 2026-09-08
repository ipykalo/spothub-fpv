import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { BuildCostDto } from '@spothub/shared';

/**
 * Presenter: what the fitted parts cost, per currency.
 *
 * Deliberately not one number. Parts get bought in whatever the shop charges
 * in, and one figure would either hide that or imply a conversion nobody did.
 */
@Component({
  selector: 'sh-build-cost-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule],
  templateUrl: './build-cost-summary.html',
  styleUrl: './build-cost-summary.scss',
})
export class BuildCostSummary {
  readonly cost = input.required<BuildCostDto>();
}
