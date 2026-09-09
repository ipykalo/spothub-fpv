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

  /** The file the text came from, so the form can say where it got it. */
  protected readonly fileName = signal<string | null>(null);
  protected readonly dragging = signal(false);

  /** Matches the schema's ceiling, checked before reading rather than after. */
  private static readonly MAX_BYTES = 500_000;

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

      if (raw === '') {
        this.fileName.set(null);
      }
    });
  }

  /**
   * Reads the file in the browser and drops its text into the same field a
   * paste would fill.
   *
   * Not an upload: no bytes reach the API, which posts the text in the JSON
   * body it already accepts. Everything downstream — the parser preview, the
   * board-mismatch warning, validation — then behaves identically.
   */
  protected async loadFile(file: File | null | undefined): Promise<void> {
    this.dragging.set(false);

    if (!file) {
      return;
    }

    if (file.size > ConfigPasteForm.MAX_BYTES) {
      this.error = 'That file is larger than any Betaflight config';
      return;
    }

    try {
      const text = await file.text();

      this.error = null;
      this.fileName.set(file.name);
      this.form.controls.raw.setValue(text);
    } catch {
      this.error = 'Could not read that file';
    }
  }

  protected onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.loadFile(input.files?.[0]);

    // Clear it, or choosing the same file twice in a row fires nothing.
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    void this.loadFile(event.dataTransfer?.files[0]);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
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
    this.fileName.set(null);
  }
}
