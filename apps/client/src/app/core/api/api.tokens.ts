import { InjectionToken } from '@angular/core';

/**
 * The API base URL, injected rather than imported from an environment file so
 * tests can supply their own and the value has one obvious source.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
