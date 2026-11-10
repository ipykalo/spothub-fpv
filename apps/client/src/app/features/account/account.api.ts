import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { StorageUsageDto } from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only, for the signed-in pilot's own account. */
@Injectable({ providedIn: 'root' })
export class AccountApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  storage(): Observable<StorageUsageDto> {
    return this.http.get<StorageUsageDto>(`${this.base}/users/me/storage`);
  }

  /** Deletes the account for good; the API also clears the session cookie. */
  deleteAccount(): Observable<unknown> {
    return this.http.delete(`${this.base}/auth/me`, { withCredentials: true });
  }
}
