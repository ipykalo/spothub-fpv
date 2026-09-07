import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  BuildDto,
  CreateBuildDto,
  ListBuildsQuery,
  UpdateBuildDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/**
 * Transport only. No caching or state — that belongs to BuildsStore, so this
 * stays trivially testable and has one reason to change.
 */
@Injectable({ providedIn: 'root' })
export class BuildsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/builds`;

  list(query: ListBuildsQuery = {}): Observable<BuildDto[]> {
    let params = new HttpParams();

    if (query.status) {
      params = params.set('status', query.status);
    }

    if (query.search) {
      params = params.set('search', query.search);
    }

    return this.http.get<BuildDto[]>(this.url, { params });
  }

  getOne(id: string): Observable<BuildDto> {
    return this.http.get<BuildDto>(`${this.url}/${id}`);
  }

  create(body: CreateBuildDto): Observable<BuildDto> {
    return this.http.post<BuildDto>(this.url, body);
  }

  update(id: string, body: UpdateBuildDto): Observable<BuildDto> {
    return this.http.patch<BuildDto>(`${this.url}/${id}`, body);
  }

  /** Resolves when the server confirms the delete; the 204 carries no body. */
  remove(id: string): Observable<null> {
    return this.http.delete<null>(`${this.url}/${id}`);
  }
}
