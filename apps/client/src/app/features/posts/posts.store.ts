import { Injectable, inject, signal } from '@angular/core';
import type {
  CreatePostDto,
  PostDto,
  PostSummaryDto,
  UpdatePostDto,
} from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { PostsApi } from './posts.api';

/**
 * Signal-backed state for the viewer's own posts. The public blog and a post's
 * page are resolved per route instead, because they are rendered on the server.
 */
@Injectable({ providedIn: 'root' })
export class PostsStore {
  private readonly api = inject(PostsApi);

  private readonly items = signal<readonly PostSummaryDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly mine = this.items.asReadonly();
  readonly loading = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  async loadMine(): Promise<void> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      this.items.set(await firstValueFrom(this.api.listMine()));
    } catch {
      this.failure.set('Your posts could not be loaded.');
    } finally {
      this.busy.set(false);
    }
  }

  create(input: CreatePostDto): Promise<PostDto> {
    return firstValueFrom(this.api.create(input));
  }

  update(id: string, input: UpdatePostDto): Promise<PostDto> {
    return firstValueFrom(this.api.update(id, input));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.api.remove(id));
    this.items.update((posts) => posts.filter((post) => post.id !== id));
  }
}
