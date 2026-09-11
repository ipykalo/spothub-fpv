import {
  HttpClient,
  HttpEventType,
  HttpHeaders,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateLogImportDto,
  FlightDto,
  KnownLogsResultDto,
  LogImportDto,
  LogUploadTicketDto,
  RequestLogUploadDto,
  SessionDto,
  UpdateFlightDto,
} from '@spothub/shared';
import { type Observable, filter, map } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to FlightsStore. */
@Injectable({ providedIn: 'root' })
export class FlightsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /** Which of these checksums are already imported. */
  known(checksums: readonly string[]): Observable<KnownLogsResultDto> {
    return this.http.post<KnownLogsResultDto>(`${this.base}/flight-logs/known`, {
      checksums,
    });
  }

  requestUpload(body: RequestLogUploadDto): Observable<LogUploadTicketDto> {
    return this.http.post<LogUploadTicketDto>(`${this.base}/flight-logs/uploads`, body);
  }

  /**
   * The bytes go straight to object storage, not through our API, with
   * progress as a percentage. The auth interceptor leaves this request alone:
   * the signature is in the query string, and storage rejects a request that
   * also carries an Authorization header.
   */
  upload(ticket: LogUploadTicketDto, file: File): Observable<number> {
    const request = new HttpRequest('PUT', ticket.uploadUrl, file, {
      headers: new HttpHeaders({ 'Content-Type': ticket.contentType }),
      reportProgress: true,
    });

    return this.http.request(request).pipe(
      filter(
        (event) =>
          event.type === HttpEventType.UploadProgress ||
          event.type === HttpEventType.Response,
      ),
      map((event) =>
        event.type === HttpEventType.UploadProgress && event.total
          ? Math.round((event.loaded / event.total) * 100)
          : 100,
      ),
    );
  }

  /** Answers 202 at once; the parsing happens in the background. */
  startImport(body: CreateLogImportDto): Observable<LogImportDto> {
    return this.http.post<LogImportDto>(`${this.base}/flight-logs/imports`, body);
  }

  getImport(id: string): Observable<LogImportDto> {
    return this.http.get<LogImportDto>(`${this.base}/flight-logs/imports/${id}`);
  }

  sessions(): Observable<SessionDto[]> {
    return this.http.get<SessionDto[]>(`${this.base}/flights/sessions`);
  }

  updateFlight(id: string, body: UpdateFlightDto): Observable<FlightDto> {
    return this.http.patch<FlightDto>(`${this.base}/flights/${id}`, body);
  }

  removeFlight(id: string): Observable<null> {
    return this.http.delete<null>(`${this.base}/flights/${id}`);
  }
}
