import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'spothub:isPublic';

/** Opts a route out of the globally registered JwtAuthGuard. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
