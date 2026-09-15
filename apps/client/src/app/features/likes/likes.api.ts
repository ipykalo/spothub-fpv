import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { LikesDto } from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** What can be liked, as it appears in the API's paths. */
export type LikeTarget = 'posts' | 'builds';

/**
 * Transport only. Both calls are idempotent and answer with the new count.
 * The count a page starts from comes with the post or build itself.
 */
@Injectable({ providedIn: 'root' })
export class LikesApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  like(target: LikeTarget, id: string): Observable<LikesDto> {
    return this.http.put<LikesDto>(this.url(target, id), {});
  }

  unlike(target: LikeTarget, id: string): Observable<LikesDto> {
    return this.http.delete<LikesDto>(this.url(target, id));
  }

  private url(target: LikeTarget, id: string): string {
    return `${this.base}/${target}/${id}/likes`;
  }
}
