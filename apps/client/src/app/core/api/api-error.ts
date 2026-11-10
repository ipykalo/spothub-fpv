import { HttpErrorResponse } from '@angular/common/http';

/**
 * The API's own explanation when it gave one — "Your storage is full: …" —
 * rather than a status code, else `fallback`.
 */
export function apiMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;

    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
  }

  return fallback;
}
