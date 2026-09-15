import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AssetDto,
  CreatePostDto,
  ListPublishedPostsQuery,
  PostDto,
  PostSummaryDto,
  RequestUploadDto,
  UpdatePostDto,
  UploadTicketDto,
} from '@spothub/shared';
import type { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/api/api.tokens';

/** Transport only. No caching or state — that belongs to PostsStore. */
@Injectable({ providedIn: 'root' })
export class PostsApi {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/posts`;

  /** The viewer's own posts, drafts included. */
  listMine(): Observable<PostSummaryDto[]> {
    return this.http.get<PostSummaryDto[]>(this.url);
  }

  /** The blog, for anyone: Public posts, newest first, optionally about one build. */
  listPublished(query: ListPublishedPostsQuery = {}): Observable<PostSummaryDto[]> {
    const params = query.buildId
      ? new HttpParams().set('buildId', query.buildId)
      : undefined;
    return this.http.get<PostSummaryDto[]>(`${this.url}/published`, { params });
  }

  /** One of the viewer's own posts, or one shared as Public or Unlisted. */
  getOne(id: string): Observable<PostDto> {
    return this.http.get<PostDto>(`${this.url}/${id}`);
  }

  create(body: CreatePostDto): Observable<PostDto> {
    return this.http.post<PostDto>(this.url, body);
  }

  update(id: string, body: UpdatePostDto): Observable<PostDto> {
    return this.http.patch<PostDto>(`${this.url}/${id}`, body);
  }

  /** Resolves when the server confirms the delete; the 204 carries no body. */
  remove(id: string): Observable<null> {
    return this.http.delete<null>(`${this.url}/${id}`);
  }

  /**
   * An image for the post, step one: somewhere to PUT the bytes. Step two is
   * the same presigned PUT build photos use (`PhotosApi.upload`).
   */
  requestImageUpload(
    postId: string,
    body: RequestUploadDto,
  ): Observable<UploadTicketDto> {
    return this.http.post<UploadTicketDto>(`${this.url}/${postId}/images/uploads`, body);
  }

  /** Step three: the API reads the image, strips EXIF and attaches it to the post. */
  commitImage(postId: string, assetId: string): Observable<AssetDto> {
    return this.http.post<AssetDto>(`${this.url}/${postId}/images/${assetId}/commit`, {});
  }

  /** One of the post's own images, or null for no cover. */
  setCover(postId: string, assetId: string | null): Observable<null> {
    return this.http.patch<null>(`${this.url}/${postId}/images/cover`, { assetId });
  }
}
