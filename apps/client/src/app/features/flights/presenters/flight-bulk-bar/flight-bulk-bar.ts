import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { UpdateFlightDto } from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import type { ChoiceOption } from '../../../../core/components/choice-option';

/**
 * A choice meaning "take it off", distinct from the picker's own null — which
 * here means "leave each flight as it is", the only safe thing for an
 * untouched field to mean when the change lands on many flights at once.
 */
const CLEAR = '__clear__';

/**
 * Presenter: sets one build and one battery pack on every ticked flight.
 *
 * Nothing is written until Apply, so a build and a pack can be chosen
 * together. The choices are view state and live here; the container clears
 * the selection after a successful change, which removes this bar and resets
 * them with it.
 */
@Component({
  selector: 'sh-flight-bulk-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autocomplete, MatButtonModule],
  templateUrl: './flight-bulk-bar.html',
  styleUrl: './flight-bulk-bar.scss',
  host: { class: 'block' },
})
export class FlightBulkBar {
  readonly count = input.required<number>();
  readonly builds = input<readonly ChoiceOption<string>[]>([]);
  readonly batteries = input<readonly ChoiceOption<string>[]>([]);
  readonly saving = input(false);

  readonly applied = output<UpdateFlightDto>();
  readonly cleared = output();

  protected readonly build = signal<string | null>(null);
  protected readonly battery = signal<string | null>(null);

  protected readonly buildChoices = computed<readonly ChoiceOption<string>[]>(() => [
    { value: CLEAR, label: 'No build', icon: 'block' },
    ...this.builds(),
  ]);

  protected readonly batteryChoices = computed<readonly ChoiceOption<string>[]>(() => [
    { value: CLEAR, label: 'No pack', icon: 'block' },
    ...this.batteries(),
  ]);

  protected readonly ready = computed(
    () => this.build() !== null || this.battery() !== null,
  );

  protected apply(): void {
    const build = this.build();
    const battery = this.battery();

    this.applied.emit({
      ...(build === null ? {} : { buildId: build === CLEAR ? null : build }),
      ...(battery === null ? {} : { batteryUnitId: battery === CLEAR ? null : battery }),
    });
  }
}
