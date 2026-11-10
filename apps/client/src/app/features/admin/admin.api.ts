import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AppSettingsDto, UpdateAppSettingsDto } from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. The API answers both calls with the settings as they now stand. */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  settings(): Observable<AppSettingsDto> {
    return this.http.get<AppSettingsDto>(this.url());
  }

  updateSettings(body: UpdateAppSettingsDto): Observable<AppSettingsDto> {
    return this.http.patch<AppSettingsDto>(this.url(), body);
  }

  private url(): string {
    return `${this.base}/admin/settings`;
  }
}
