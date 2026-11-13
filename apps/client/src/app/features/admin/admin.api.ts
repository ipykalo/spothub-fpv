import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AdminUserDto,
  AppSettingsDto,
  HiddenCommentDto,
  HiddenCountDto,
  HiddenPostDto,
  ReportDto,
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

  /** Every open report, newest first. */
  reports(): Observable<ReportDto[]> {
    return this.http.get<ReportDto[]>(`${this.base}/admin/reports`);
  }

  /** Closes a report and every other open one about the same post or comment; answers with what is left. */
  resolveReport(id: string): Observable<ReportDto[]> {
    return this.http.patch<ReportDto[]>(`${this.base}/admin/reports/${id}`, {
      resolved: true,
    });
  }

  /** Posts an admin hid, most recently hidden first. */
  hiddenPosts(): Observable<HiddenPostDto[]> {
    return this.http.get<HiddenPostDto[]>(`${this.base}/admin/posts/hidden`);
  }

  hiddenComments(): Observable<HiddenCommentDto[]> {
    return this.http.get<HiddenCommentDto[]>(`${this.base}/admin/comments/hidden`);
  }

  setPostHidden(id: string, hidden: boolean): Observable<unknown> {
    return this.http.patch(`${this.base}/admin/posts/${id}`, { hidden });
  }

  deletePost(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/admin/posts/${id}`);
  }

  setCommentHidden(id: string, hidden: boolean): Observable<unknown> {
    return this.http.patch(`${this.base}/admin/comments/${id}`, { hidden });
  }

  deleteComment(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/admin/comments/${id}`);
  }

  /** Hides, or shows again, every post a pilot wrote; answers with how many changed. */
  setPilotPostsHidden(userId: string, hidden: boolean): Observable<HiddenCountDto> {
    return this.http.patch<HiddenCountDto>(`${this.base}/admin/users/${userId}/posts`, {
      hidden,
    });
  }

  private url(): string {
    return `${this.base}/admin/settings`;
  }
}
