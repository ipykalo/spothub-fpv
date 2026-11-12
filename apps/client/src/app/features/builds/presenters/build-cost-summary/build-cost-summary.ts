import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { BuildCostDto } from '@spothub/shared';

import { priceLine } from '../../../../core/format/money';
import { costLines } from './cost-lines';

/**
 * Presenter: what the fitted parts and the repairs cost.
 *
 * The headline is one number in the viewer's own currency and one in USD,
 * each price converted at the official rate of the day it was paid, marked
 * "≈". Under it, what was actually paid, per currency — the conversion never
 * replaces it.
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

  protected readonly parts = computed(() =>
    costLines(this.cost().totals, this.cost().converted.totals),
  );
  protected readonly repairs = computed(() =>
    costLines(this.cost().repairTotals, this.cost().converted.repairTotals),
  );

  /** On a bought quad, how much of the total is the quad itself. */
  protected readonly boughtNote = computed(() => {
    const { boughtFor, totals, converted } = this.cost();

    if (boughtFor === null) {
      return null;
    }

    // The same "paid ≈ home ≈ USD" as every other price.
    const line = priceLine(boughtFor.amount, boughtFor.currency, converted.boughtFor);
    const approx = line.approx.length ? ` ${line.approx.join(' · ')}` : '';
    const price = `Bought complete for ${line.paid}${approx}`;
    const onlyThePrice =
      totals.length === 1 &&
      totals[0].currency === boughtFor.currency &&
      totals[0].amount === boughtFor.amount;

    return onlyThePrice ? `${price}.` : `${price}, plus what was fitted since.`;
  });
}
