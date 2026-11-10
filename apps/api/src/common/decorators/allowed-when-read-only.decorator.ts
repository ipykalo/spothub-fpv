import { SetMetadata } from '@nestjs/common';

export const ALLOWED_WHEN_READ_ONLY_KEY = 'spothub:allowedWhenReadOnly';

/**
 * Lets a read-only account make this one write anyway. Kept for leaving the
 * app — deleting one's own account — which no restriction should stand in
 * the way of.
 */
export const AllowedWhenReadOnly = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOWED_WHEN_READ_ONLY_KEY, true);
