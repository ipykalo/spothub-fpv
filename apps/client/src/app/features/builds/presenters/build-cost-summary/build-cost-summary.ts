import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
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

  /** On a bought quad, how much of the total is the quad itself. */
  protected readonly boughtNote = computed(() => {
    const { boughtFor, totals } = this.cost();

    if (boughtFor === null) {
      return null;
    }

    const price = `Bought complete for ${String(boughtFor.amount)} ${boughtFor.currency}`;
    const onlyThePrice =
      totals.length === 1 &&
      totals[0].currency === boughtFor.currency &&
      totals[0].amount === boughtFor.amount;

    return onlyThePrice ? `${price}.` : `${price}, plus what was fitted since.`;
  });
}
