import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  PilotNameDto,
  PilotPhotoDto,
  RequestUploadDto,
  StorageUsageDto,
  UpdateHomeCurrencyDto,
  UpdatePilotNameDto,
  UploadTicketDto,
} from '@spothub/shared';
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

  setPilotName(body: UpdatePilotNameDto): Observable<PilotNameDto> {
    return this.http.patch<PilotNameDto>(`${this.base}/users/me/name`, body);
  }

  setHomeCurrency(body: UpdateHomeCurrencyDto): Observable<UpdateHomeCurrencyDto> {
    return this.http.patch<UpdateHomeCurrencyDto>(`${this.base}/users/me/currency`, body);
  }

  /** Step one of a new photo: where to put the bytes, and the id to commit. */
  requestPhotoUpload(body: RequestUploadDto): Observable<UploadTicketDto> {
    return this.http.post<UploadTicketDto>(`${this.base}/users/me/photo/uploads`, body);
  }

  /** Step two: the bytes go straight to storage, never through the API. */
  putPhoto(ticket: UploadTicketDto, file: Blob): Observable<unknown> {
    return this.http.put(ticket.uploadUrl, file, {
      // Part of what was signed, so it must match the ticket exactly.
      headers: new HttpHeaders({ 'Content-Type': ticket.contentType }),
    });
  }

  /** Step three: the API crops it, strips it and makes it the pilot's photo. */
  commitPhoto(assetId: string): Observable<PilotPhotoDto> {
    return this.http.post<PilotPhotoDto>(
      `${this.base}/users/me/photo/uploads/${assetId}/commit`,
      null,
    );
  }

  removePhoto(): Observable<PilotPhotoDto> {
    return this.http.delete<PilotPhotoDto>(`${this.base}/users/me/photo`);
  }

  /** Deletes the account for good; the API also clears the session cookie. */
  deleteAccount(): Observable<unknown> {
    return this.http.delete(`${this.base}/auth/me`, { withCredentials: true });
  }
}
