import { TextFieldModule } from '@angular/cdk/text-field';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MAX_COMMENT_LENGTH, updateCommentSchema } from '@spothub/shared';

/**
 * Presenter: a box to write a question, a reply or an edit in. Checks the
 * words with the same schema the API uses, and hands them up — it never posts.
 *
 * The `<form>` is bound to a `FormGroup` on purpose: `ngSubmit` comes from
 * that directive, and without it pressing the submit button falls through to
 * the browser's own form submission, which reloads the page and throws away
 * what was written.
 */
@Component({
  selector: 'sh-comment-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule, TextFieldModule],
  templateUrl: './comment-form.html',
  styleUrl: './comment-form.scss',
})
export class CommentForm {
  readonly label = input('Your question');
  readonly submitLabel = input('Post');
  /** What an edit starts from. */
  readonly initial = input('');
  readonly saving = input(false);

  readonly submitted = output<string>();
  readonly cancelled = output();

  protected readonly maxLength = MAX_COMMENT_LENGTH;
  protected readonly form = new FormGroup({
    body: new FormControl('', { nonNullable: true }),
  });
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const initial = this.initial();
      untracked(() => {
        this.form.controls.body.setValue(initial);
      });
    });
  }

  protected submit(): void {
    const parsed = updateCommentSchema.safeParse(this.form.getRawValue());

    if (!parsed.success) {
      this.error.set(parsed.error.issues[0]?.message ?? 'Check what you wrote');
      return;
    }

    this.error.set(null);
    this.submitted.emit(parsed.data.body);
  }
}
