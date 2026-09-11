import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ConfigDto,
  ConfigWithRawDto,
  CreateConfigDto,
  UpdateConfigDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to ConfigsStore. */
@Injectable({ providedIn: 'root' })
export class ConfigsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Without the CLI text: a list of captures should not ship a dump each. */
  list(buildId: string): Observable<ConfigDto[]> {
    return this.http.get<ConfigDto[]>(this.url(buildId));
  }

  /** With the CLI text, for viewing or diffing. */
  getOne(buildId: string, configId: string): Observable<ConfigWithRawDto> {
    return this.http.get<ConfigWithRawDto>(`${this.url(buildId)}/${configId}`);
  }

  create(buildId: string, body: CreateConfigDto): Observable<ConfigWithRawDto> {
    return this.http.post<ConfigWithRawDto>(this.url(buildId), body);
  }

  updateNote(
    buildId: string,
    configId: string,
    body: UpdateConfigDto,
  ): Observable<ConfigDto> {
    return this.http.patch<ConfigDto>(`${this.url(buildId)}/${configId}`, body);
  }

  remove(buildId: string, configId: string): Observable<null> {
    return this.http.delete<null>(`${this.url(buildId)}/${configId}`);
  }

  private url(buildId: string): string {
    return `${this.base}/builds/${buildId}/configs`;
  }
}
