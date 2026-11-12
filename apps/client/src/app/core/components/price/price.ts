import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ConvertedTotalDto } from '@spothub/shared';

import { priceLine } from '../../format/money';

/**
 * Presenter: one price, the same everywhere — what was paid, in the currency
 * it was paid in, then roughly what that is in the viewer's own currency and
 * in USD, each at the rate of the day it was paid. The conversions come from
 * the API with the price; this only lays them out.
 *
 * `inline` puts the conversions on the same line; otherwise they sit under
 * the figure, right-aligned, for a column in a row.
 */
@Component({
  selector: 'sh-price',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './price.html',
  styleUrl: './price.scss',
})
export class Price {
  readonly amount = input.required<number>();
  readonly currency = input.required<string>();
  readonly converted = input<readonly ConvertedTotalDto[]>([]);
  readonly inline = input(false);
  /** The larger figure a card leads with. */
  readonly emphasis = input(false);

  protected readonly line = computed(() =>
    priceLine(this.amount(), this.currency(), this.converted()),
  );
}
