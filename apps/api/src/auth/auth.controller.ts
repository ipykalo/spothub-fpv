import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { AccessTokenDto, CurrentUserDto } from '@spothub/shared';
import type { CookieOptions, Request, Response } from 'express';

import { type AuthenticatedUser, CurrentUser, Public } from '../common';
import type { Env } from '../config';
import { AuthService } from './services/auth.service';
import type { GoogleProfile } from './auth.types';
import type { IssuedTokens } from './services/token.service';

const REFRESH_COOKIE = 'spothub_rt';

@Controller('auth')
export class AuthController {
  private readonly clientUrl: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.clientUrl = config.get('CLIENT_URL', { infer: true });
    this.isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  }

  /** Kicks off the OAuth dance. The guard performs the redirect. */
  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  startGoogleSignIn(): void {
    // Intentionally empty.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async completeGoogleSignIn(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const profile = request.user as GoogleProfile;
    const tokens = await this.auth.signInWithGoogle(profile);

    this.setRefreshCookie(response, tokens);

    // The access token travels in the URL fragment rather than the query
    // string: fragments are not sent to servers and stay out of access logs
    // and Referer headers. The client reads it once and clears it.
    response.redirect(
      `${this.clientUrl}/auth/callback#access_token=${tokens.accessToken}`,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenDto> {
    const current = this.readRefreshCookie(request);

    if (!current) {
      throw new UnauthorizedException('No refresh token');
    }

    const tokens = await this.auth.refresh(current);
    this.setRefreshCookie(response, tokens);

    return { accessToken: tokens.accessToken, expiresIn: tokens.accessTokenTtl };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOut(this.readRefreshCookie(request));
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions(0));
  }

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserDto> {
    const current = await this.auth.currentUser(user.id);

    if (!current) {
      throw new NotFoundException('User not found');
    }

    return current;
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, string> | undefined;
    return cookies?.[REFRESH_COOKIE];
  }

  private setRefreshCookie(response: Response, tokens: IssuedTokens): void {
    response.cookie(
      REFRESH_COOKIE,
      tokens.refreshToken,
      this.cookieOptions(tokens.refreshTokenTtl * 1000),
    );
  }

  private cookieOptions(maxAge: number): CookieOptions {
    return {
      httpOnly: true,
      // Lax rather than Strict: the OAuth callback is a cross-site redirect
      // back to us, and Strict would drop the cookie on that navigation.
      sameSite: 'lax',
      secure: this.isProduction,
      path: '/api/auth',
      maxAge,
    };
  }
}
