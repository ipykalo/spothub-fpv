import {
  HttpClient,
  HttpEventType,
  HttpHeaders,
  HttpRequest,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { AssetDto, RequestUploadDto, UploadTicketDto } from '@spothub/shared';
import { type Observable, filter, map } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to PhotosStore. */
@Injectable({ providedIn: 'root' })
export class PhotosApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(buildId: string): Observable<AssetDto[]> {
    return this.http.get<AssetDto[]>(this.url(buildId));
  }

  /** Step one: reserve a key and get somewhere to PUT the bytes. */
  requestUpload(buildId: string, body: RequestUploadDto): Observable<UploadTicketDto> {
    return this.http.post<UploadTicketDto>(`${this.url(buildId)}/uploads`, body);
  }

  /**
   * Step two: the bytes go straight to object storage, not through our API.
   *
   * Emits progress as a percentage so the tile can fill while a phone photo
   * uploads. The auth interceptor deliberately leaves this request alone —
   * the signature is in the query string, and storage rejects a request that
   * also carries an Authorization header.
   */
  upload(ticket: UploadTicketDto, file: File): Observable<number> {
    const request = new HttpRequest('PUT', ticket.uploadUrl, file, {
      // Part of what was signed, so it must match the ticket exactly or
      // storage answers with a signature mismatch.
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

  /** Step three: the API reads the object, strips EXIF and makes a thumbnail. */
  commit(buildId: string, assetId: string): Observable<AssetDto> {
    return this.http.post<AssetDto>(`${this.url(buildId)}/${assetId}/commit`, {});
  }

  remove(buildId: string, assetId: string): Observable<null> {
    return this.http.delete<null>(`${this.url(buildId)}/${assetId}`);
  }

  reorder(buildId: string, assetIds: readonly string[]): Observable<AssetDto[]> {
    return this.http.patch<AssetDto[]>(`${this.url(buildId)}/order`, { assetIds });
  }

  setCover(buildId: string, assetId: string | null): Observable<null> {
    return this.http.patch<null>(`${this.url(buildId)}/cover`, { assetId });
  }

  private url(buildId: string): string {
    return `${this.base}/builds/${buildId}/photos`;
  }
}
