import { TextFieldModule } from '@angular/cdk/text-field';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import {
  ALLOWED_IMAGE_MIME,
  type AllowedImageMime,
  type BuildDto,
  type CreatePostDto,
  MAX_POST_BODY_LENGTH,
  MAX_POST_SUMMARY_LENGTH,
  MAX_POST_TITLE_LENGTH,
  MAX_UPLOAD_BYTES,
  type PostDto,
  type PostImageDto,
  Visibility,
  createPostSchema,
  postImageMarkdown,
} from '@spothub/shared';

import { Markdown } from '../../../../core/components/markdown/markdown';
import {
  applyEdit,
  insertBlock,
  replaceQuietly,
  selectionOf,
} from '../../../../core/components/markdown-editor/markdown-edits';
import { MarkdownToolbar } from '../../../../core/components/markdown-editor/markdown-toolbar';

type EditorMode = 'edit' | 'preview';

/** Uploads one image to the post the draft describes, creating it first if it has never been saved. */
export type ImageUploader = (file: File, draft: CreatePostDto) => Promise<PostImageDto>;

/** Sets the cover from a new image, or clears it with null. */
export type CoverSetter = (
  file: File | null,
  draft: CreatePostDto,
) => Promise<PostImageDto | null>;

/**
 * Presenter: the post editor. Owns the fields, the toolbar, the preview and
 * validation; it never saves, and never uploads — `uploadImage` and
 * `changeCover` are handed in by the container, which owns both.
 *
 * An image goes in as a placeholder line where the writer is typing and
 * becomes `![caption](image:<id>)` once it has uploaded, so writing carries
 * on while it does. Linked builds are ticked from the author's own, in the
 * order ticked.
 */
@Component({
  selector: 'sh-post-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Markdown,
    MarkdownToolbar,
    MatButtonModule,
    MatButtonToggleModule,
    MatChipsModule,
    MatIconModule,
    MatMenuModule,
    ReactiveFormsModule,
    TextFieldModule,
  ],
  templateUrl: './post-form.html',
  styleUrl: './post-form.scss',
})
export class PostForm {
  readonly post = input<PostDto | null>(null);
  /** The author's own builds, to link the post to. */
  readonly builds = input<readonly BuildDto[]>([]);
  readonly isEdit = input(false);
  readonly saving = input(false);
  readonly errorMessage = input<string | null>(null);
  readonly uploadImage = input<ImageUploader | null>(null);
  readonly changeCover = input<CoverSetter | null>(null);

  readonly saved = output<CreatePostDto>();
  readonly cancelled = output();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly visibility = Visibility;
  protected readonly accept = ALLOWED_IMAGE_MIME.join(',');
  protected readonly maxTitle = MAX_POST_TITLE_LENGTH;
  protected readonly maxSummary = MAX_POST_SUMMARY_LENGTH;
  protected readonly maxBody = MAX_POST_BODY_LENGTH;

  protected readonly form = this.fb.group({
    title: [''],
    summary: [''],
    bodyMd: [''],
  });

  /** Where the post stands now: a draft until it is published. */
  protected readonly currentVisibility = signal<Visibility>(Visibility.Private);
  protected readonly isPublished = computed(
    () => this.currentVisibility() !== Visibility.Private,
  );

  /** Linked build ids, in the order they were ticked. */
  protected readonly linked = signal<readonly string[]>([]);
  /** The post's images, so the preview can show the ones the body refers to. */
  protected readonly images = signal<readonly PostImageDto[]>([]);
  protected readonly cover = signal<PostImageDto | null>(null);

  protected readonly mode = signal<EditorMode>('edit');
  protected readonly previewTitle = signal('');
  protected readonly previewBody = signal('');

  protected readonly uploading = signal(0);
  protected readonly coverBusy = signal(false);
  protected readonly busy = computed(
    () => this.saving() || this.uploading() > 0 || this.coverBusy(),
  );

  private readonly problem = signal<string | null>(null);

  /** Whatever the container reported wins; the editor's own problems fill the gap. */
  protected readonly message = computed(() => this.errorMessage() ?? this.problem());

  private readonly body = viewChild.required<ElementRef<HTMLTextAreaElement>>('body');

  constructor() {
    effect(() => {
      const post = this.post();

      if (!post) {
        return;
      }

      untracked(() => {
        this.form.patchValue({
          title: post.title,
          summary: post.summary ?? '',
          bodyMd: post.bodyMd,
        });
        this.currentVisibility.set(post.visibility);
        this.linked.set(post.buildIds);
        this.images.set(post.images);
        this.cover.set(
          post.images.find((image) => image.id === post.coverAssetId) ?? null,
        );
      });
    });
  }

  protected isLinked(buildId: string): boolean {
    return this.linked().includes(buildId);
  }

  protected toggleBuild(buildId: string, selected: boolean): void {
    this.linked.update((ids) => {
      if (!selected) {
        return ids.filter((id) => id !== buildId);
      }

      return ids.includes(buildId) ? ids : [...ids, buildId];
    });
  }

  protected setMode(mode: EditorMode): void {
    if (mode === 'preview') {
      this.previewTitle.set(this.form.controls.title.value.trim());
      this.previewBody.set(this.form.controls.bodyMd.value);
    }

    this.mode.set(mode);
  }

  protected submit(visibility: Visibility): void {
    this.problem.set(null);

    if (this.uploading() > 0 || this.coverBusy()) {
      this.problem.set('Wait for the images to finish uploading');
      return;
    }

    // The same schema the API validates against, so the two cannot disagree.
    const parsed = createPostSchema.safeParse({
      ...this.form.getRawValue(),
      visibility,
      buildIds: this.linked(),
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.problem.set(parsed.error.issues[0]?.message ?? 'Check the post');
      return;
    }

    this.saved.emit(parsed.data);
  }

  protected onImagesChosen(event: Event): void {
    const picker = event.target as HTMLInputElement;
    void this.addImages(Array.from(picker.files ?? []));
    // Cleared so choosing the same file again still fires a change.
    picker.value = '';
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = imageFiles(event.clipboardData);

    if (files.length > 0) {
      event.preventDefault();
      void this.addImages(files);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
    }
  }

  protected onDrop(event: DragEvent): void {
    const files = imageFiles(event.dataTransfer);

    if (files.length > 0) {
      event.preventDefault();
      void this.addImages(files);
    }
  }

  protected onCoverChosen(event: Event): void {
    const picker = event.target as HTMLInputElement;
    const file = picker.files?.[0];
    picker.value = '';

    if (file) {
      void this.setCover(file);
    }
  }

  protected removeCover(): void {
    void this.setCover(null);
  }

  /** One after another, each as a placeholder where the writer is, filled in when it lands. */
  private async addImages(files: readonly File[]): Promise<void> {
    const upload = this.uploadImage();

    if (!upload) {
      return;
    }

    this.problem.set(null);
    const textarea = this.body().nativeElement;

    for (const file of files) {
      const rejection = imageProblem(file);

      if (rejection) {
        this.problem.set(rejection);
        continue;
      }

      const caption = file.name.replace(/\.[^.]+$/, '');
      const placeholder = `![Uploading ${caption}…](uploading:${crypto.randomUUID()})`;
      applyEdit(textarea, insertBlock(selectionOf(textarea), placeholder));
      this.uploading.update((count) => count + 1);

      try {
        const image = await upload(file, this.draft());
        this.images.update((images) => [...images, image]);
        replaceQuietly(textarea, placeholder, postImageMarkdown(caption, image.id));
      } catch (error) {
        replaceQuietly(textarea, placeholder, '');
        this.problem.set(
          error instanceof Error ? error.message : `${file.name} did not upload`,
        );
      } finally {
        this.uploading.update((count) => count - 1);
      }
    }
  }

  private async setCover(file: File | null): Promise<void> {
    const change = this.changeCover();

    if (!change) {
      return;
    }

    if (file) {
      const rejection = imageProblem(file);

      if (rejection) {
        this.problem.set(rejection);
        return;
      }
    }

    this.problem.set(null);
    this.coverBusy.set(true);

    try {
      const image = await change(file, this.draft());
      this.cover.set(image);

      if (image) {
        this.images.update((images) => [...images, image]);
      }
    } catch (error) {
      this.problem.set(
        error instanceof Error ? error.message : 'The cover could not be changed',
      );
    } finally {
      this.coverBusy.set(false);
    }
  }

  /**
   * What the post would be saved as if it has never been: an image needs a
   * post to belong to, so the first one saves it as a draft.
   */
  private draft(): CreatePostDto {
    const raw = this.form.getRawValue();
    const parsed = createPostSchema.safeParse({
      ...raw,
      title: raw.title.trim() || 'Untitled post',
      visibility: Visibility.Private,
      buildIds: this.linked(),
    });

    if (!parsed.success) {
      throw new Error(
        parsed.error.issues[0]?.message ?? 'Check the post before adding images',
      );
    }

    return parsed.data;
  }
}

/** The images among whatever was dropped or pasted. */
function imageFiles(transfer: DataTransfer | null): File[] {
  return Array.from(transfer?.files ?? []).filter((file) =>
    file.type.startsWith('image/'),
  );
}

/** Refused before a byte moves, with the limits the API enforces again. */
function imageProblem(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME.includes(file.type as AllowedImageMime)) {
    return `${file.name} is not a JPEG, PNG, WebP or AVIF image`;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is larger than 25 MB`;
  }

  return null;
}
