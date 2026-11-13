import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreateReportDto } from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. Filing a report answers with nothing; what an admin reads is the admin feature's. */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  file(body: CreateReportDto): Observable<unknown> {
    return this.http.post(`${this.base}/reports`, body);
  }
}
