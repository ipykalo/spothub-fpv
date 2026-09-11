import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { type ControlValueAccessor, NgControl } from '@angular/forms';
import {
  MatAutocompleteModule,
  type MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormFieldModule, type SubscriptSizing } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

import type { ChoiceOption } from '../choice-option';

/**
 * A picker you can type into — the app's only dropdown.
 *
 * Works with `formControlName` and `ngModel`, and just as well with plain
 * `[value]` / `(valueChange)` where there is no form. Typing narrows the
 * options; the field never keeps text that is not an option, so the value is
 * always one of `options` (or null, when `emptyLabel` offers that).
 *
 * Registers itself as its own control's value accessor — the pattern
 * `MatSelect` uses — rather than through an `NG_VALUE_ACCESSOR` provider,
 * which would need a `forwardRef` back to this class.
 */
@Component({
  selector: 'sh-autocomplete',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatAutocompleteModule, MatFormFieldModule, MatIconModule, MatInputModule],
  templateUrl: './autocomplete.html',
  styleUrl: './autocomplete.scss',
  host: { class: 'block', '[class.compact]': 'compact()' },
})
export class Autocomplete<T> implements ControlValueAccessor {
  readonly label = input<string | null>(null);
  readonly options = input.required<readonly ChoiceOption<T>[]>();
  /** Offers "nothing chosen" as the first option, under this label. */
  readonly emptyLabel = input<string | null>(null);
  readonly hint = input<string | null>(null);
  readonly placeholder = input('');
  /** For a field with no visible label, such as one inside a list row. */
  readonly ariaLabel = input<string | null>(null);
  readonly subscriptSizing = input<SubscriptSizing>('fixed');
  /** A 40px field for a list row rather than a form. */
  readonly compact = input(false, { transform: booleanAttribute });
  readonly value = model<T | null>(null);

  private readonly ngControl = inject(NgControl, { self: true, optional: true });

  /** What has been typed since the panel opened. Null shows every option. */
  protected readonly query = signal<string | null>(null);
  protected readonly disabled = signal(false);

  private onChange: (value: T | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  protected readonly choices = computed<readonly ChoiceOption<T | null>[]>(() => {
    const empty = this.emptyLabel();

    return empty === null
      ? this.options()
      : [{ value: null, label: empty }, ...this.options()];
  });

  protected readonly selected = computed(
    () => this.choices().find((option) => option.value === this.value()) ?? null,
  );

  protected readonly filtered = computed(() => {
    const words = (this.query() ?? '').toLocaleLowerCase().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      return this.choices();
    }

    return this.choices().filter((option) => {
      const text = `${option.label} ${option.hint ?? ''}`.toLocaleLowerCase();
      return words.every((word) => text.includes(word));
    });
  });

  /** The typing in progress, else the chosen option's label. */
  protected readonly text = computed(() => this.query() ?? this.selected()?.label ?? '');

  protected readonly displayOption = (option: ChoiceOption<T | null> | null): string =>
    option?.label ?? '';

  constructor() {
    if (this.ngControl) {
      this.ngControl.valueAccessor = this;
    }
  }

  writeValue(value: T | null): void {
    this.value.set(value ?? null);
    this.query.set(null);
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected onSelected(event: MatAutocompleteSelectedEvent): void {
    const option = event.option.value as ChoiceOption<T | null>;
    this.commit(option.value);
  }

  /**
   * Settles the field when the panel closes, rather than on blur.
   *
   * Blur fires as the pointer goes down on an option, before the click that
   * selects it; resetting the filter there re-renders the list under the
   * pointer and the click lands on a different option. Closing comes after.
   * An exact match is taken — typing "crash" and tabbing away picks Crash —
   * and anything else snaps back to the current choice.
   */
  protected onClosed(): void {
    const typed = this.query()?.trim().toLocaleLowerCase();

    if (typed) {
      const exact = this.choices().find(
        (option) => option.label.toLocaleLowerCase() === typed,
      );

      if (exact) {
        this.commit(exact.value);
      }
    }

    this.query.set(null);
  }

  protected onBlur(): void {
    this.onTouched();
  }

  private commit(value: T | null): void {
    this.query.set(null);

    if (value === this.value()) {
      return;
    }

    this.value.set(value);
    this.onChange(value);
  }
}
