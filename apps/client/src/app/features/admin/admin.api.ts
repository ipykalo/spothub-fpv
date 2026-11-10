import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AdminUserDto,
  AppSettingsDto,
  UpdateAdminUserDto,
  UpdateAppSettingsDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. Every write answers with the record as it now stands. */
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

  users(): Observable<AdminUserDto[]> {
    return this.http.get<AdminUserDto[]>(`${this.base}/admin/users`);
  }

  updateUser(id: string, body: UpdateAdminUserDto): Observable<AdminUserDto> {
    return this.http.patch<AdminUserDto>(`${this.base}/admin/users/${id}`, body);
  }

  private url(): string {
    return `${this.base}/admin/settings`;
  }
}
