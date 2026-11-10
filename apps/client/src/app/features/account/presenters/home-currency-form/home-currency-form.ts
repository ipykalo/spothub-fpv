import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { Currency } from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { CURRENCY_OPTIONS } from '../../../../core/components/currency-options';

/**
 * Presenter: the currency a pilot's prices start in and their totals are
 * shown in, besides USD. Picking one saves it; there is nothing else to fill.
 */
@Component({
  selector: 'sh-home-currency-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autocomplete],
  templateUrl: './home-currency-form.html',
  styleUrl: './home-currency-form.scss',
})
export class HomeCurrencyForm {
  readonly currency = input.required<Currency>();
  readonly error = input<string | null>(null);

  readonly chosen = output<Currency>();

  protected readonly options = CURRENCY_OPTIONS;

  protected pick(currency: Currency | null): void {
    if (currency !== null && currency !== this.currency()) {
      this.chosen.emit(currency);
    }
  }
}
