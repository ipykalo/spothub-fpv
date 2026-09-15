import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import {
  type BuildDto,
  type CreatePostDto,
  MAX_POST_BODY_LENGTH,
  MAX_POST_SUMMARY_LENGTH,
  MAX_POST_TITLE_LENGTH,
  type PostDto,
  VISIBILITY_LABELS,
  Visibility,
  createPostSchema,
} from '@spothub/shared';

import { Autocomplete } from '../../../../core/components/autocomplete/autocomplete';
import { choicesFrom } from '../../../../core/components/choice-option';
import { Markdown } from '../../../../core/components/markdown/markdown';

type EditorMode = 'write' | 'preview';

/**
 * Presenter: owns the post form and its validation, nothing else. It never
 * saves — it emits a value checked against the same schema the API uses.
 *
 * Linked builds are ticked from the author's own; the order they were ticked
 * in is the order the post shows them.
 */
@Component({
  selector: 'sh-post-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Autocomplete,
    Markdown,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
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

  readonly saved = output<CreatePostDto>();
  readonly cancelled = output();

  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly visibilityOptions = choicesFrom(
    Object.values(Visibility),
    VISIBILITY_LABELS,
  );
  protected readonly maxTitle = MAX_POST_TITLE_LENGTH;
  protected readonly maxSummary = MAX_POST_SUMMARY_LENGTH;
  protected readonly maxBody = MAX_POST_BODY_LENGTH;

  protected readonly form = this.fb.group({
    title: [''],
    summary: [''],
    bodyMd: [''],
    visibility: [Visibility.Private as Visibility],
  });

  /** Linked build ids, in the order they were ticked. */
  protected readonly linked = signal<readonly string[]>([]);

  /** Writing or previewing the body — view state. */
  protected readonly mode = signal<EditorMode>('write');
  /** The body as it was when Preview was chosen. */
  protected readonly previewSource = signal('');

  private readonly validationError = signal<string | null>(null);

  /** Whatever the container reported wins; local validation fills the gap. */
  protected readonly message = computed(
    () => this.errorMessage() ?? this.validationError(),
  );

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
          visibility: post.visibility,
        });
        this.linked.set(post.buildIds);
      });
    });
  }

  protected isLinked(buildId: string): boolean {
    return this.linked().includes(buildId);
  }

  protected toggleBuild(buildId: string, checked: boolean): void {
    this.linked.update((ids) => {
      if (!checked) {
        return ids.filter((id) => id !== buildId);
      }

      return ids.includes(buildId) ? ids : [...ids, buildId];
    });
  }

  protected setMode(mode: EditorMode): void {
    if (mode === 'preview') {
      this.previewSource.set(this.form.controls.bodyMd.value);
    }

    this.mode.set(mode);
  }

  protected submit(): void {
    this.validationError.set(null);

    // The same schema the API validates against, so the two cannot disagree.
    const parsed = createPostSchema.safeParse({
      ...this.form.getRawValue(),
      buildIds: this.linked(),
    });

    if (!parsed.success) {
      this.form.markAllAsTouched();
      this.validationError.set(parsed.error.issues[0]?.message ?? 'Check the form');
      return;
    }

    this.saved.emit(parsed.data);
  }
}
