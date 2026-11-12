import {
  Controller,
  Delete,
  ForbiddenException,
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

import {
  AllowedWhenReadOnly,
  type AuthenticatedUser,
  CurrentUser,
  Public,
  RateLimit,
} from '../common';
import type { Env } from '../config';
import { AuthService } from './services/auth.service';
import type { GoogleProfile } from './auth.types';
import { RestrictedCountryError } from './restricted-country.error';
import { UnverifiedEmailError } from './unverified-email.error';
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
  @RateLimit('signIn')
  @Get('google')
  @UseGuards(AuthGuard('google'))
  startGoogleSignIn(): void {
    // Intentionally empty.
  }

  @Public()
  @RateLimit('signIn')
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async completeGoogleSignIn(
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const profile = request.user as GoogleProfile;
    let tokens: IssuedTokens;

    try {
      tokens = await this.auth.signInWithGoogle(profile, request.ip);
    } catch (error) {
      // A browser arrives here from Google, so a refusal is a page to land on,
      // not a JSON body: back to sign-in, saying why in general terms.
      if (error instanceof RestrictedCountryError) {
        response.redirect(`${this.clientUrl}/login?denied=country`);
        return;
      }

      if (error instanceof UnverifiedEmailError) {
        response.redirect(`${this.clientUrl}/login?denied=unverified`);
        return;
      }

      if (error instanceof ForbiddenException) {
        response.redirect(`${this.clientUrl}/login?denied=1`);
        return;
      }
      throw error;
    }

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

  /**
   * Signs the pilot out on every device at once. Open to a read-only account
   * too, as leaving always is. This device's cookie is cleared here; the
   * others' are refused at their next refresh.
   */
  @Post('logout-all')
  @AllowedWhenReadOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutEverywhere(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.signOutEverywhere(user.id);
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions(0));
  }

  /**
   * Deletes the signed-in pilot's account for good, and signs them out. Open
   * to a read-only account too: no restriction stands between someone and
   * leaving. Lives here rather than in `users` because the session cookie is
   * this controller's to clear.
   */
  @Delete('me')
  @AllowedWhenReadOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.deleteAccount(user.id);
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
