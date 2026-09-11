import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { LogFileStatus, type LogImportDto } from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import type { ChoiceOption } from '../../../../core/components/choice-option';
import type { ImportFile, ImportPhase } from '../../flights.store';

/** What the panel hands up: the files, and where their flights should go. */
export interface LogImportRequest {
  readonly files: readonly File[];
  /** Null means match each log's model name against the build names. */
  readonly buildId: string | null;
}

/**
 * Presenter: drop the radio's LOGS folder, watch it import.
 *
 * A whole folder, not a file at a time — that is the decision the feature
 * rests on. If importing is per file it gets used twice and abandoned. So
 * this takes a folder dropped from the SD card, a folder picked in the file
 * dialog, or loose files, and reads directories recursively.
 *
 * Holds only view state: which build is chosen and whether something is
 * being dragged over it.
 */
@Component({
  selector: 'sh-log-import-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Autocomplete, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './log-import-panel.html',
  styleUrl: './log-import-panel.scss',
})
export class LogImportPanel {
  readonly builds = input<readonly ChoiceOption<string>[]>([]);
  readonly phase = input<ImportPhase>('idle');
  readonly files = input<readonly ImportFile[]>([]);
  readonly batches = input<readonly LogImportDto[]>([]);
  readonly message = input<string | null>(null);
  readonly importedFlights = input(0);

  readonly importRequested = output<LogImportRequest>();
  readonly resetRequested = output();

  protected readonly buildId = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly busy = computed(() => {
    const phase = this.phase();
    return phase === 'preparing' || phase === 'uploading' || phase === 'processing';
  });

  protected readonly skipped = computed(
    () => this.files().filter((file) => file.state === 'known').length,
  );

  protected readonly toUpload = computed(
    () => this.files().filter((file) => file.state !== 'known').length,
  );

  protected readonly uploaded = computed(
    () => this.files().filter((file) => file.state === 'uploaded').length,
  );

  /** Every file that did not make it, whether at upload or at parsing. */
  protected readonly problems = computed(() => [
    ...this.files()
      .filter((file) => file.state === 'failed')
      .map((file) => ({ name: file.name, error: file.error ?? 'Upload failed' })),
    ...this.batches().flatMap((batch) =>
      batch.files
        .filter((file) => file.status === LogFileStatus.Failed)
        .map((file) => ({
          name: file.fileName,
          error: file.error ?? 'Could not be read',
        })),
    ),
  ]);

  protected readonly progress = computed(() => {
    const total = this.toUpload();
    return total === 0 ? 0 : Math.round((this.uploaded() / total) * 100);
  });

  protected onFolderChosen(event: Event): void {
    this.fromInput(event);
  }

  protected onFilesChosen(event: Event): void {
    this.fromInput(event);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  protected async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);

    const transfer = event.dataTransfer;

    if (!transfer || this.busy()) {
      return;
    }

    // Entries have to be taken synchronously, before the event is released.
    const entries = Array.from(transfer.items)
      .map((item) => item.webkitGetAsEntry())
      .filter((entry): entry is FileSystemEntry => entry !== null);

    const files =
      entries.length > 0 ? await collect(entries) : Array.from(transfer.files);
    this.emit(files);
  }

  private fromInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emit(Array.from(input.files ?? []));
    // Cleared, so choosing the same folder again still fires a change.
    input.value = '';
  }

  private emit(files: readonly File[]): void {
    if (files.length > 0 && !this.busy()) {
      this.importRequested.emit({ files, buildId: this.buildId() });
    }
  }
}

/** Every file under the dropped entries, walking into folders. */
async function collect(entries: readonly FileSystemEntry[]): Promise<File[]> {
  const files: File[] = [];

  for (const entry of entries) {
    if (entry.isFile) {
      files.push(await fileOf(entry as FileSystemFileEntry));
    } else if (entry.isDirectory) {
      files.push(...(await collect(await children(entry as FileSystemDirectoryEntry))));
    }
  }

  return files;
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/**
 * A folder's entries. `readEntries` hands them over in batches — about a
 * hundred at a time in Chrome — and signals the end with an empty one, so it
 * is called until that arrives.
 */
async function children(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = directory.createReader();
  const all: FileSystemEntry[] = [];

  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });

    if (batch.length === 0) {
      return all;
    }

    all.push(...batch);
  }
}
