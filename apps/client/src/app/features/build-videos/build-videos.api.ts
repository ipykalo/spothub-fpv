import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { BuildVideoDto, CreateBuildVideoDto } from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to BuildVideosStore. */
@Injectable({ providedIn: 'root' })
export class BuildVideosApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(buildId: string): Observable<BuildVideoDto[]> {
    return this.http.get<BuildVideoDto[]>(this.url(buildId));
  }

  add(buildId: string, body: CreateBuildVideoDto): Observable<BuildVideoDto> {
    return this.http.post<BuildVideoDto>(this.url(buildId), body);
  }

  remove(buildId: string, videoId: string): Observable<null> {
    return this.http.delete<null>(`${this.url(buildId)}/${videoId}`);
  }

  private url(buildId: string): string {
    return `${this.base}/builds/${buildId}/videos`;
  }
}
