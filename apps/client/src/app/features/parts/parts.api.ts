import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreatePartDto,
  CreatePartSourceDto,
  ListPartsQuery,
  PartDto,
  PartSourceDto,
  UpdatePartDto,
  UrlPreviewDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/**
 * Transport only. No caching or state — that belongs to PartsStore, so this
 * stays trivially testable and has one reason to change.
 */
@Injectable({ providedIn: 'root' })
export class PartsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/parts`;

  list(query: ListPartsQuery = {}): Observable<PartDto[]> {
    let params = new HttpParams();

    if (query.category) {
      params = params.set('category', query.category);
    }

    if (query.status) {
      params = params.set('status', query.status);
    }

    if (query.search) {
      params = params.set('search', query.search);
    }

    return this.http.get<PartDto[]>(this.url, { params });
  }

  getOne(id: string): Observable<PartDto> {
    return this.http.get<PartDto>(`${this.url}/${id}`);
  }

  create(body: CreatePartDto): Observable<PartDto> {
    return this.http.post<PartDto>(this.url, body);
  }

  update(id: string, body: UpdatePartDto): Observable<PartDto> {
    return this.http.patch<PartDto>(`${this.url}/${id}`, body);
  }

  /** Resolves when the server confirms the delete; the 204 carries no body. */
  remove(id: string): Observable<null> {
    return this.http.delete<null>(`${this.url}/${id}`);
  }

  addSource(partId: string, body: CreatePartSourceDto): Observable<PartSourceDto> {
    return this.http.post<PartSourceDto>(`${this.url}/${partId}/sources`, body);
  }

  removeSource(partId: string, sourceId: string): Observable<null> {
    return this.http.delete<null>(`${this.url}/${partId}/sources/${sourceId}`);
  }

  /** The API reads the page's OpenGraph tags; the browser never fetches it. */
  urlPreview(url: string): Observable<UrlPreviewDto> {
    return this.http.post<UrlPreviewDto>(`${this.url}/url-preview`, { url });
  }
}
