import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { BlockedPilotDto } from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only, for the signed-in pilot's own block list. */
@Injectable({ providedIn: 'root' })
export class BlocksApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(): Observable<BlockedPilotDto[]> {
    return this.http.get<BlockedPilotDto[]>(`${this.base}/users/me/blocks`);
  }

  block(userId: string): Observable<unknown> {
    return this.http.put(`${this.base}/users/blocks/${userId}`, null);
  }

  unblock(userId: string): Observable<unknown> {
    return this.http.delete(`${this.base}/users/blocks/${userId}`);
  }
}
