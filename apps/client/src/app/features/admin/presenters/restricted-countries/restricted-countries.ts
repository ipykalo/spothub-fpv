import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { countryName } from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { countryOptions } from '../../country-options';

/**
 * Presenter: the countries nobody but an admin may sign in from. Picking a
 * country adds it; each one on the list can be taken off. Saving is the
 * container's.
 */
@Component({
  selector: 'sh-restricted-countries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autocomplete, MatButtonModule, MatIconModule],
  templateUrl: './restricted-countries.html',
  styleUrl: './restricted-countries.scss',
})
export class RestrictedCountries {
  readonly countries = input.required<readonly string[]>();
  readonly saving = input(false);

  readonly countryAdded = output<string>();
  readonly countryRemoved = output<string>();

  protected readonly options = computed(() => countryOptions(this.countries()));
  protected readonly listed = computed(() =>
    this.countries()
      .map((code) => ({ code, name: countryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'en')),
  );

  protected pick(code: string | null): void {
    if (code !== null) {
      this.countryAdded.emit(code);
    }
  }
}
