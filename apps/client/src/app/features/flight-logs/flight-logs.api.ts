import {
  HttpClient,
  HttpEventType,
  HttpHeaders,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  CreateLogImportDto,
  FlightTrackDto,
  KnownLogsResultDto,
  LogImportDto,
  LogUploadTicketDto,
  RequestLogUploadDto,
} from '@spothub/shared';
import { type Observable, filter, map } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to FlightLogsStore. */
@Injectable({ providedIn: 'root' })
export class FlightLogsApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  /**
   * One flight's path, read back out of the log it arrived in. Under
   * flight-logs because that is whose file it is parsed from.
   */
  track(flightId: string): Observable<FlightTrackDto> {
    return this.http.get<FlightTrackDto>(`${this.base}/flight-logs/tracks/${flightId}`);
  }

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
}
