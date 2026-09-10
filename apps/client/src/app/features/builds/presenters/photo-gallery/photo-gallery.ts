import {
  type CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ALLOWED_IMAGE_MIME, type AssetDto } from '@spothub/shared';

import type { PendingUpload } from '../../photos.store';

/**
 * Presenter: the photos on a build, and somewhere to drop more.
 *
 * Injects nothing stateful and holds no application state — the container owns
 * the store. That is what lets the same grid serve the V4 public build pages,
 * where there is no store behind it and `readonly` is set.
 */
@Component({
  selector: 'sh-photo-gallery',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './photo-gallery.html',
  styleUrl: './photo-gallery.scss',
})
export class PhotoGallery {
  readonly photos = input.required<readonly AssetDto[]>();
  /** Files still on their way up, shown as tiles so the grid does not jump. */
  readonly pending = input<readonly PendingUpload[]>([]);
  readonly coverAssetId = input<string | null>(null);
  /** The public build pages will render this same grid with nothing to change. */
  readonly readonlyMode = input(false);

  readonly filesChosen = output<readonly File[]>();
  readonly removeRequested = output<AssetDto>();
  readonly coverChosen = output<AssetDto>();
  readonly reordered = output<readonly string[]>();

  protected readonly accept = ALLOWED_IMAGE_MIME.join(',');
  protected dragging = false;

  protected readonly isEmpty = computed(
    () => this.photos().length === 0 && this.pending().length === 0,
  );

  protected onDrop(event: CdkDragDrop<readonly AssetDto[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const ids = this.photos().map((photo) => photo.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    this.reordered.emit(ids);
  }

  protected onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.emitFiles(input.files);
    // Cleared so choosing the same file twice in a row still fires a change.
    input.value = '';
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging = true;
  }

  protected onDragLeave(): void {
    this.dragging = false;
  }

  protected onFileDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    this.emitFiles(event.dataTransfer?.files ?? null);
  }

  private emitFiles(list: FileList | null): void {
    const files = Array.from(list ?? []);

    if (files.length > 0) {
      this.filesChosen.emit(files);
    }
  }
}
