import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  BuildCostDto,
  BuildPartDto,
  InstallPartDto,
  RemoveInstallDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/**
 * Transport only. No caching or state — that belongs to BuildPartsStore.
 */
@Injectable({ providedIn: 'root' })
export class BuildPartsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(buildId: string, installedOnly = false): Observable<BuildPartDto[]> {
    const params = installedOnly
      ? new HttpParams().set('installed', 'true')
      : new HttpParams();

    return this.http.get<BuildPartDto[]>(this.url(buildId), { params });
  }

  cost(buildId: string): Observable<BuildCostDto> {
    return this.http.get<BuildCostDto>(`${this.url(buildId)}/cost`);
  }

  install(buildId: string, body: InstallPartDto): Observable<BuildPartDto> {
    return this.http.post<BuildPartDto>(this.url(buildId), body);
  }

  /**
   * A DELETE carrying a body: removal records an end date rather than dropping
   * the row, and the server answers with the closed install.
   */
  remove(
    buildId: string,
    installId: string,
    body: RemoveInstallDto,
  ): Observable<BuildPartDto> {
    return this.http.delete<BuildPartDto>(`${this.url(buildId)}/${installId}`, { body });
  }

  private url(buildId: string): string {
    return `${this.base}/builds/${buildId}/parts`;
  }
}
