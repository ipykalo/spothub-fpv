import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  CONFIG_KIND_LABELS,
  type CreateConfigDto,
  createConfigSchema,
  parseBetaflightConfig,
} from '@spothub/shared';

/**
 * Presenter: paste a Betaflight CLI capture.
 *
 * Parses as you type using the same function the API uses, so what is shown
 * here is exactly what gets stored — the preview cannot promise something the
 * server then fails to record.
 */
@Component({
  selector: 'sh-config-paste-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './config-paste-form.html',
  styleUrl: './config-paste-form.scss',
})
export class ConfigPasteForm {
  readonly saving = input(false);
  /** The board this build's last capture came from, if any. */
  readonly knownMcuId = input<string | null>(null);

  readonly pasted = output<CreateConfigDto>();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly kindLabels = CONFIG_KIND_LABELS;
  protected error: string | null = null;

  private readonly rawText = signal('');

  protected readonly form = this.fb.group({
    raw: [''],
    note: [''],
  });

  /** What the parser can see. Null until there is enough text to bother. */
  protected readonly detected = computed(() => {
    const raw = this.rawText();
    return raw.trim().length >= 20 ? parseBetaflightConfig(raw) : null;
  });

  /** Nothing recognised at all — almost certainly the wrong paste. */
  protected readonly unrecognised = computed(() => {
    const found = this.detected();
    return found !== null && found.fwVersion === null && found.boardName === null;
  });

  /**
   * A capture from a different flight controller than this build's last one.
   *
   * `mcu_id` is burned into the MCU, so this is a real mismatch rather than a
   * guess — usually the wrong window was copied from.
   */
  protected readonly otherBoard = computed(() => {
    const known = this.knownMcuId();
    const found = this.detected()?.mcuId ?? null;

    return known !== null && found !== null && known !== found;
  });

  constructor() {
    this.form.controls.raw.valueChanges.subscribe((raw) => {
      this.rawText.set(raw);
    });
  }

  protected submit(): void {
    this.error = null;

    const raw = this.form.getRawValue();
    const parsed = createConfigSchema.safeParse({
      raw: raw.raw,
      note: raw.note || null,
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.error = parsed.error.issues[0]?.message ?? 'Check the paste';
      return;
    }

    this.pasted.emit(parsed.data);
    this.form.reset({ raw: '', note: '' });
    this.rawText.set('');
  }
}
