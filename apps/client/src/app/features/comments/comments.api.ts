import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  CommentSubject,
  type ConversationDto,
  type CreateCommentDto,
  type MarkAnswerDto,
  type UnreadCommentsDto,
  type UpdateCommentDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/**
 * Transport only. No caching or state — that belongs to CommentsStore.
 * Every change answers with the whole conversation.
 */
@Injectable({ providedIn: 'root' })
export class CommentsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(subject: CommentSubject, subjectId: string): Observable<ConversationDto> {
    return this.http.get<ConversationDto>(this.url(subject, subjectId));
  }

  create(
    subject: CommentSubject,
    subjectId: string,
    body: CreateCommentDto,
  ): Observable<ConversationDto> {
    return this.http.post<ConversationDto>(this.url(subject, subjectId), body);
  }

  update(
    subject: CommentSubject,
    subjectId: string,
    commentId: string,
    body: UpdateCommentDto,
  ): Observable<ConversationDto> {
    return this.http.patch<ConversationDto>(`${this.url(subject, subjectId)}/${commentId}`, body);
  }

  remove(subject: CommentSubject, subjectId: string, commentId: string): Observable<ConversationDto> {
    return this.http.delete<ConversationDto>(`${this.url(subject, subjectId)}/${commentId}`);
  }

  setAnswer(
    subject: CommentSubject,
    subjectId: string,
    commentId: string,
    body: MarkAnswerDto,
  ): Observable<ConversationDto> {
    return this.http.put<ConversationDto>(
      `${this.url(subject, subjectId)}/${commentId}/answer`,
      body,
    );
  }

  /** The owner has read everything on the spot or build. The 204 carries no body. */
  markRead(subject: CommentSubject, subjectId: string): Observable<null> {
    return this.http.post<null>(`${this.url(subject, subjectId)}/read`, {});
  }

  unread(): Observable<UnreadCommentsDto> {
    return this.http.get<UnreadCommentsDto>(`${this.baseUrl}/comments/unread`);
  }

  private url(subject: CommentSubject, subjectId: string): string {
    const collection = subject === CommentSubject.Spot ? 'spots' : 'builds';
    return `${this.baseUrl}/${collection}/${subjectId}/comments`;
  }
}
