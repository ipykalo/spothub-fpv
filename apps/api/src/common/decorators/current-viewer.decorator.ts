import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Whoever is looking on a `@Public()` read: the signed-in person, or null for
 * a visitor.
 *
 * The global guard still checks a bearer token on public routes when one is
 * sent, so a signed-in viewer is recognised there too — their own build still
 * answers as theirs. A missing or invalid token just leaves them a visitor.
 */
export const CurrentViewer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | null => {
    const request = context.switchToHttp().getRequest<Request>();
    return (request.user as AuthenticatedUser | undefined) ?? null;
  },
);
