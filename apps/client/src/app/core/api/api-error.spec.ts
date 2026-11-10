import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';

import { apiMessage } from './api-error';

describe('apiMessage', () => {
  it('gives the API’s own explanation', () => {
    const error = new HttpErrorResponse({
      status: 413,
      error: { message: 'Your storage is full: 2 GB of 2 GB used.' },
    });

    expect(apiMessage(error, 'Upload failed')).toBe(
      'Your storage is full: 2 GB of 2 GB used.',
    );
  });

  it('falls back when the API said nothing readable, or it was not the API at all', () => {
    expect(apiMessage(new HttpErrorResponse({ status: 0 }), 'Upload failed')).toBe(
      'Upload failed',
    );
    expect(
      apiMessage(new HttpErrorResponse({ status: 500, error: 'oops' }), 'Upload failed'),
    ).toBe('Upload failed');
    expect(apiMessage(new Error('offline'), 'Upload failed')).toBe('Upload failed');
  });
});
