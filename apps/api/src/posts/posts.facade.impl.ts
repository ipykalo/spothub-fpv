import { Injectable } from '@nestjs/common';

import { PostsFacade } from './abstract/posts.facade';
import { PostsRepository } from './abstract/posts.repository';

/** Serves the posts facade out of the module's own repository. */
@Injectable()
export class PostsFacadeImpl extends PostsFacade {
  constructor(private readonly posts: PostsRepository) {
    super();
  }

  async authorIfVisible(viewerId: string | null, postId: string): Promise<string | null> {
    // The same rule a post's own page applies: the viewer's post, or a shared one.
    const post = await this.posts.findVisibleForViewer(viewerId, postId);
    return post?.authorId ?? null;
  }
}
