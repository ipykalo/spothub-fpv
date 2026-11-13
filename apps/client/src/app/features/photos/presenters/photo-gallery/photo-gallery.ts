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
import { neighbourPhotos } from './neighbour-photos';

/** How wide the gallery box is: the whole screen on a phone, at most 46rem. */
const GALLERY_SIZES = '(max-width: 46rem) 100vw, 46rem';
/** The full-screen viewer fills the screen. */
const VIEWER_SIZES = '100vw';
/**
 * The longest a step waits for its photo to decode before swapping anyway.
 * A preloaded photo decodes well inside it; a slow network must not make the
 * buttons feel stuck.
 */
const DECODE_WAIT_MS = 250;
import { photoSrcset } from '../../../../core/images/srcset';
import { swipeStep } from './swipe';

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
  /**
   * A photo would not load — most likely its signed address ran out on a page
   * left open. The container fetches the list again (`core/api/signed-links.ts`).
   */
  readonly imageFailed = output();

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

  /** The sizes a browser may choose a photo in (`core/images/srcset.ts`). */
  protected readonly srcset = photoSrcset;
  protected readonly gallerySizes = GALLERY_SIZES;
  protected readonly viewerSizes = VIEWER_SIZES;

  /**
   * The photos either side of the one showing, two each way, fetched ahead
   * so next and previous — even two quick steps — show at once.
   */
  protected readonly neighbours = computed(() =>
    neighbourPhotos(this.photos(), this.activeIndex()),
  );

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
    void this.goTo(position);
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

  /**
   * Where the latest step is going while its photo decodes. Steps add up from
   * there, so three quick presses move three photos, not one.
   */
  private target: number | null = null;

  /** Wraps, so pressing at either end keeps moving rather than dead-ending. */
  protected step(delta: number): void {
    const count = this.photos().length;

    if (count > 0) {
      const from = this.target ?? this.activeIndex();
      void this.goTo((from + delta + count) % count);
    }
  }

  /**
   * Decodes the photo first, then swaps it in, so the switch shows a ready
   * picture rather than an empty box that paints in. Only the latest of
   * several quick steps lands.
   */
  private async goTo(position: number): Promise<void> {
    this.target = position;

    const photo = this.photos()[position] as AssetDto | undefined;

    if (photo) {
      await this.decoded(photo);
    }

    if (this.target === position) {
      this.index.set(position);
      this.target = null;
    }
  }

  /**
   * The photo decoded, in the size the box it is going into will choose —
   * which the preloads have usually fetched already — or after
   * DECODE_WAIT_MS, whichever comes first. Never fails: a photo that will not
   * decode is shown, broken, as it would have been.
   */
  private decoded(photo: AssetDto): Promise<void> {
    const src = photo.displayUrl ?? photo.url ?? photo.thumbUrl;

    if (!src || typeof Image === 'undefined') {
      return Promise.resolve();
    }

    const image = new Image();
    const srcset = photoSrcset(photo);

    image.sizes = this.viewerOpen() ? VIEWER_SIZES : GALLERY_SIZES;
    if (srcset) {
      image.srcset = srcset;
    }
    image.src = src;

    return Promise.race([
      image.decode().catch(() => undefined),
      new Promise<void>((done) => setTimeout(done, DECODE_WAIT_MS)),
    ]);
  }

  /** Where and when the finger went down, until it lifts. */
  private touchStart: { x: number; y: number; at: number } | null = null;

  /**
   * When the last swipe ended. Some browsers follow a swipe with a tap, which
   * must not also open the viewer; most do not, and a flag left standing
   * would swallow the reader's next real tap. So only a tap this close after
   * a swipe is ignored.
   */
  private swipedAt = Number.NEGATIVE_INFINITY;

  protected onTouchStart(event: TouchEvent): void {
    const touch = event.touches.item(0);
    this.touchStart =
      event.touches.length === 1 && touch
        ? { x: touch.clientX, y: touch.clientY, at: event.timeStamp }
        : null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    const start = this.touchStart;
    const touch = event.changedTouches.item(0);
    this.touchStart = null;

    if (!start || !touch) {
      return;
    }

    const step = swipeStep(
      touch.clientX - start.x,
      touch.clientY - start.y,
      event.timeStamp - start.at,
    );

    if (step !== 0 && this.hasMany()) {
      // The page's own clock, not the events': a touch's and a click's
      // timeStamp need not count from the same moment.
      this.swipedAt = performance.now();
      this.step(step);
    }
  }

  /** The photo was tapped: open it full size, unless the tap was the end of a swipe. */
  protected onPhotoClick(): void {
    if (performance.now() - this.swipedAt < 500) {
      return;
    }

    this.openViewer();
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
