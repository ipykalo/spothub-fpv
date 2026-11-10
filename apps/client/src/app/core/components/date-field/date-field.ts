import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { type ControlValueAccessor, NgControl } from '@angular/forms';
import { provideNativeDateAdapter } from '@angular/material/core';
import {
  type MatDatepickerInputEvent,
  MatDatepickerModule,
} from '@angular/material/datepicker';
import { MatFormFieldModule, type SubscriptSizing } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { fromIsoDate, toIsoDate } from './iso-date';

/**
 * A date you pick from a calendar — or type, if that is quicker. Every date
 * field in the app is one of these.
 *
 * Its value is the ISO calendar day the contracts already speak
 * (`2026-04-01`), or `''` when empty, so a form holding it needs no change:
 * the `Date` the picker works in never leaves this component. Works with
 * `formControlName` and `ngModel`, or plain `[value]` / `(valueChange)`.
 *
 * Registers itself as its own control's value accessor, as `sh-autocomplete`
 * does, rather than through an `NG_VALUE_ACCESSOR` provider.
 */
@Component({
  selector: 'sh-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [provideNativeDateAdapter()],
  templateUrl: './date-field.html',
  styleUrl: './date-field.scss',
  host: { class: 'block' },
})
export class DateField implements ControlValueAccessor {
  readonly label = input<string | null>(null);
  readonly hint = input<string | null>(null);
  /** The earliest and latest day offered, as ISO days. */
  readonly min = input<string | null>(null);
  readonly max = input<string | null>(null);
  readonly subscriptSizing = input<SubscriptSizing>('fixed');
  readonly value = model<string>('');

  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  protected readonly disabled = signal(false);
  protected readonly date = computed(() => fromIsoDate(this.value()));
  protected readonly minDate = computed(() => fromIsoDate(this.min()));
  protected readonly maxDate = computed(() => fromIsoDate(this.max()));

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  /** Fires for a day picked on the calendar and for typing that parses as one. */
  protected onDate(event: MatDatepickerInputEvent<Date>): void {
    const next = event.value === null ? '' : toIsoDate(event.value);

    this.value.set(next);
    this.onChange(next);
  }

  protected onBlur(): void {
    this.onTouched();
  }
}
