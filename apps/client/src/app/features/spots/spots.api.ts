import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreateDraftSpotDto, CreateSpotDto, SpotDto, UpdateSpotDto } from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to SpotsStore. */
@Injectable({ providedIn: 'root' })
export class SpotsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/spots`;

  list(): Observable<SpotDto[]> {
    return this.http.get<SpotDto[]>(this.url);
  }

  getOne(id: string): Observable<SpotDto> {
    return this.http.get<SpotDto>(`${this.url}/${id}`);
  }

  create(body: CreateSpotDto): Observable<SpotDto> {
    return this.http.post<SpotDto>(this.url, body);
  }

  createDraft(body: CreateDraftSpotDto): Observable<SpotDto> {
    return this.http.post<SpotDto>(`${this.url}/drafts`, body);
  }

  update(id: string, body: UpdateSpotDto): Observable<SpotDto> {
    return this.http.patch<SpotDto>(`${this.url}/${id}`, body);
  }

  /** Resolves when the server confirms the delete; the 204 carries no body. */
  remove(id: string): Observable<null> {
    return this.http.delete<null>(`${this.url}/${id}`);
  }
}
