import {
  type CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ALLOWED_IMAGE_MIME, type AssetDto } from '@spothub/shared';

import type { PendingUpload } from '../../photos.store';

/**
 * Presenter: one photo shown large, the rest as a strip beneath it.
 *
 * A grid of equal tiles is the wrong shape for build photos — you look at one
 * quad at a time, and a thumbnail is too small to tell whether the wiring is
 * tidy. The strip is also where reordering happens, since dragging a small
 * thing a short distance beats dragging a large one.
 *
 * Injects nothing stateful and holds no application state; which photo is on
 * screen is view state, not something the app cares about. That is what lets
 * this same component serve the V4 public build pages with `readonlyMode` set.
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
  /** Files still on their way up, shown in the strip so it does not jump. */
  readonly pending = input<readonly PendingUpload[]>([]);
  readonly coverAssetId = input<string | null>(null);
  readonly readonlyMode = input(false);
  /**
   * Whether the drop zone shows. The build page keeps it behind an Add
   * button, so by default the section shows photos rather than a control.
   */
  readonly showUploader = input(true);

  readonly filesChosen = output<readonly File[]>();
  readonly removeRequested = output<AssetDto>();
  readonly coverChosen = output<AssetDto>();
  readonly reordered = output<readonly string[]>();

  protected readonly accept = ALLOWED_IMAGE_MIME.join(',');
  protected dragging = false;

  private readonly index = signal(0);

  /**
   * Clamped rather than reset, so deleting the last photo lands on the new
   * last one instead of jumping back to the first.
   */
  protected readonly activeIndex = computed(() => {
    const count = this.photos().length;
    return count === 0 ? 0 : Math.min(this.index(), count - 1);
  });

  protected readonly active = computed<AssetDto | null>(
    () => this.photos()[this.activeIndex()] ?? null,
  );

  protected readonly hasMany = computed(() => this.photos().length > 1);

  protected readonly isEmpty = computed(
    () => this.photos().length === 0 && this.pending().length === 0,
  );

  private readonly viewerRef = viewChild<ElementRef<HTMLDialogElement>>('viewer');

  /**
   * Whether the full-size view is open.
   *
   * Mirrors the dialog rather than driving it — `showModal()` opens it, and
   * Escape closes it without asking us — so this exists only to keep the
   * large image out of the DOM while it is not being looked at.
   */
  protected readonly viewerOpen = signal(false);

  protected show(position: number): void {
    this.index.set(position);
  }

  protected openViewer(): void {
    this.viewerOpen.set(true);
    this.viewerRef()?.nativeElement.showModal();
  }

  protected closeViewer(): void {
    this.viewerRef()?.nativeElement.close();
  }

  /** Fired by `close()` and by Escape alike, so state cannot drift. */
  protected onViewerClosed(): void {
    this.viewerOpen.set(false);
  }

  /**
   * A modal dialog fills the viewport, so a click on the letterboxing lands on
   * the dialog itself rather than on any child. That is the backdrop as far as
   * the reader is concerned, and clicking it should close.
   */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.viewerRef()?.nativeElement) {
      this.closeViewer();
    }
  }

  /** Wraps, so pressing at either end keeps moving rather than dead-ending. */
  protected step(delta: number): void {
    const count = this.photos().length;

    if (count > 0) {
      this.index.set((this.activeIndex() + delta + count) % count);
    }
  }

  protected onDrop(event: CdkDragDrop<readonly AssetDto[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const ids = this.photos().map((photo) => photo.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);

    // Follow the photo that was dragged rather than the position it left, or
    // the large image changes under the reader for no reason.
    this.index.set(event.currentIndex);
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
