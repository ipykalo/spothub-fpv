import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { type CreatePostDto, type PostDto, Visibility } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { BuildsStore } from '../../builds/builds.store';
import { PostForm } from '../presenters/post-form/post-form';
import { PostsApi } from '../posts.api';
import { PostsStore } from '../posts.store';

/**
 * Container: writing a new post or editing one. Resolves which post, loads the
 * author's builds for the form to link, saves what the form hands back and
 * owns the navigation after.
 */
@Component({
  selector: 'sh-post-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PostForm],
  templateUrl: './post-form.page.html',
  styleUrl: './post-form.page.scss',
})
export class PostFormPage {
  /** Route param; absent when writing a new post. Bound via `withComponentInputBinding`. */
  readonly id = input<string | undefined>(undefined);

  private readonly store = inject(PostsStore);
  private readonly api = inject(PostsApi);
  protected readonly builds = inject(BuildsStore);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly post = signal<PostDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.id() !== undefined);

  constructor() {
    // The builds a post can link: the author's own.
    void this.builds.load();

    // Route inputs land after construction, so this cannot run in the ctor.
    effect(() => {
      const id = this.id();

      if (id) {
        untracked(() => void this.hydrate(id));
      }
    });
  }

  protected async save(input: CreatePostDto): Promise<void> {
    this.failure.set(null);
    this.saving.set(true);

    try {
      const id = this.id();
      const saved = id
        ? await this.store.update(id, input)
        : await this.store.create(input);

      this.snackBar.open(
        saved.visibility === Visibility.Private ? 'Draft saved' : 'Published',
        undefined,
        { duration: 2500 },
      );

      // A draft has no public page to show yet.
      await this.router.navigate(
        saved.visibility === Visibility.Private
          ? ['/posts']
          : ['/blog', saved.id, saved.slug],
      );
    } catch {
      this.failure.set('Could not save. Check the fields and try again.');
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigateByUrl('/posts');
  }

  private async hydrate(id: string): Promise<void> {
    try {
      const post = await firstValueFrom(this.api.getOne(id));

      // Anyone may read a shared post; only its author edits it.
      if (!post.ownedByViewer) {
        await this.router.navigate(['/blog', id], { replaceUrl: true });
        return;
      }

      this.post.set(post);
    } catch {
      this.failure.set('That post could not be loaded.');
    }
  }
}
