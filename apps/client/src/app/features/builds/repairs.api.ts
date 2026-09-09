import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateRepairDto,
  LinkInstallDto,
  RepairDto,
  UpdateRepairDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to RepairsStore. */
@Injectable({ providedIn: 'root' })
export class RepairsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(buildId: string): Observable<RepairDto[]> {
    return this.http.get<RepairDto[]>(this.url(buildId));
  }

  create(buildId: string, body: CreateRepairDto): Observable<RepairDto> {
    return this.http.post<RepairDto>(this.url(buildId), body);
  }

  update(
    buildId: string,
    repairId: string,
    body: UpdateRepairDto,
  ): Observable<RepairDto> {
    return this.http.patch<RepairDto>(`${this.url(buildId)}/${repairId}`, body);
  }

  remove(buildId: string, repairId: string): Observable<null> {
    return this.http.delete<null>(`${this.url(buildId)}/${repairId}`);
  }

  /** Blames an install on a repair, or clears it with null. */
  linkInstall(
    buildId: string,
    installId: string,
    body: LinkInstallDto,
  ): Observable<null> {
    return this.http.patch<null>(`${this.url(buildId)}/installs/${installId}`, body);
  }

  private url(buildId: string): string {
    return `${this.base}/builds/${buildId}/repairs`;
  }
}
