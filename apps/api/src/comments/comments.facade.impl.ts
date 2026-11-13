import { Injectable } from '@nestjs/common';

import { CommentsFacade } from './abstract/comments.facade';
import { CommentsService } from './comments.service';

/** Serves the comments facade through the service, which knows who may open each subject. */
@Injectable()
export class CommentsFacadeImpl extends CommentsFacade {
  constructor(private readonly comments: CommentsService) {
    super();
  }

  authorIfVisible(viewerId: string, commentId: string): Promise<string | null> {
    return this.comments.authorIfVisible(viewerId, commentId);
  }
}
