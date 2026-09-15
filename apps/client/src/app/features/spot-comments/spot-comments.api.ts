import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateSpotCommentDto,
  MarkAnswerDto,
  SpotCommentsDto,
  UnreadSpotCommentsDto,
  UpdateSpotCommentDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/**
 * Transport only. No caching or state — that belongs to SpotCommentsStore.
 * Every change answers with the whole conversation.
 */
@Injectable({ providedIn: 'root' })
export class SpotCommentsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  list(spotId: string): Observable<SpotCommentsDto> {
    return this.http.get<SpotCommentsDto>(this.url(spotId));
  }

  create(spotId: string, body: CreateSpotCommentDto): Observable<SpotCommentsDto> {
    return this.http.post<SpotCommentsDto>(this.url(spotId), body);
  }

  update(spotId: string, commentId: string, body: UpdateSpotCommentDto): Observable<SpotCommentsDto> {
    return this.http.patch<SpotCommentsDto>(`${this.url(spotId)}/${commentId}`, body);
  }

  remove(spotId: string, commentId: string): Observable<SpotCommentsDto> {
    return this.http.delete<SpotCommentsDto>(`${this.url(spotId)}/${commentId}`);
  }

  setAnswer(spotId: string, commentId: string, body: MarkAnswerDto): Observable<SpotCommentsDto> {
    return this.http.put<SpotCommentsDto>(`${this.url(spotId)}/${commentId}/answer`, body);
  }

  /** The owner has read everything on the spot. The 204 carries no body. */
  markRead(spotId: string): Observable<null> {
    return this.http.post<null>(`${this.url(spotId)}/read`, {});
  }

  unread(): Observable<UnreadSpotCommentsDto> {
    return this.http.get<UnreadSpotCommentsDto>(`${this.baseUrl}/spot-comments/unread`);
  }

  private url(spotId: string): string {
    return `${this.baseUrl}/spots/${spotId}/comments`;
  }
}
