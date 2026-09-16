import { Location } from '@angular/common';
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
import {
  type AllowedImageMime,
  type CreatePostDto,
  type PostDto,
  type PostImageDto,
  Visibility,
} from '@spothub/shared';
import { firstValueFrom, lastValueFrom } from 'rxjs';

import { BuildsStore } from '../../builds/builds.store';
import { PhotosApi } from '../../photos/photos.api';
import {
  type CoverSetter,
  type ImageUploader,
  PostForm,
} from '../presenters/post-form/post-form';
import { PostsApi } from '../posts.api';
import { PostsStore } from '../posts.store';

/**
 * Container: writing a new post or editing one. Resolves which post, loads the
 * author's builds for the form to link, uploads its images, saves what the
 * form hands back and owns the navigation after.
 *
 * An image needs a post to belong to, so the first one added to a post never
 * saved before saves it as a draft. The address then becomes that draft's
 * edit page without navigating, so nothing typed is lost.
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
  private readonly photosApi = inject(PhotosApi);
  protected readonly builds = inject(BuildsStore);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly post = signal<PostDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** The draft an image saved, for a post that had no id when the page opened. */
  private readonly createdId = signal<string | null>(null);
  private readonly postId = computed(() => this.id() ?? this.createdId());
  protected readonly isEdit = computed(() => this.postId() !== null);

  /** In flight while that first draft is saved, so a second image waits for it. */
  private creating: Promise<string> | null = null;

  protected readonly uploadImage: ImageUploader = (file, draft) =>
    this.upload(file, draft);

  protected readonly changeCover: CoverSetter = async (file, draft) => {
    const postId = await this.ensurePost(draft);

    if (!file) {
      await firstValueFrom(this.api.setCover(postId, null));
      return null;
    }

    const image = await this.upload(file, draft);
    await firstValueFrom(this.api.setCover(postId, image.id));
    return image;
  };

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
      const id = this.postId();
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

  /** The presigned flow build photos use: ask, PUT the bytes to storage, commit. */
  private async upload(file: File, draft: CreatePostDto): Promise<PostImageDto> {
    const postId = await this.ensurePost(draft);

    try {
      const ticket = await firstValueFrom(
        this.api.requestImageUpload(postId, {
          fileName: file.name,
          mime: file.type as AllowedImageMime,
          sizeBytes: file.size,
        }),
      );
      await lastValueFrom(this.photosApi.upload(ticket, file));
      const asset = await firstValueFrom(this.api.commitImage(postId, ticket.assetId));

      if (!asset.url) {
        throw new Error('missing url');
      }

      return {
        id: asset.id,
        url: asset.url,
        thumbUrl: asset.thumbUrl,
        width: asset.width,
        height: asset.height,
      };
    } catch {
      throw new Error(`${file.name} did not upload. Try again.`);
    }
  }

  private ensurePost(draft: CreatePostDto): Promise<string> {
    const existing = this.postId();

    if (existing) {
      return Promise.resolve(existing);
    }

    this.creating ??= this.store
      .create(draft)
      .then((post) => {
        this.createdId.set(post.id);
        this.location.replaceState(`/posts/${post.id}/edit`);
        return post.id;
      })
      .catch(() => {
        throw new Error(
          'The post could not be saved as a draft, so the image was not added.',
        );
      })
      .finally(() => {
        this.creating = null;
      });

    return this.creating;
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
