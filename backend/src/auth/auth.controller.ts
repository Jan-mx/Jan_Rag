import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { ok } from '../common/api-response';
import { AuthService } from './auth.service';
import { IdentityService } from '../identity/identity.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly identity: IdentityService) {}

  @Public()
  @Post('login')
  async login(@Body() body: any, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body?.loginId, body?.password);
    response.cookie(this.auth.cookieName(), result.refreshToken, this.auth.cookieOptions());
    return ok({ accessToken: result.accessToken, currentUser: result.currentUser });
  }

  @Public()
  @Post('register')
  async register(@Body() body: any) {
    await this.auth.register(body);
    return ok(null);
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = request.cookies?.[this.auth.cookieName()];
    const result = await this.auth.refresh(refreshToken);
    response.cookie(this.auth.cookieName(), result.refreshToken, this.auth.cookieOptions());
    return ok({ accessToken: result.accessToken, currentUser: result.currentUser });
  }

  @Post('logout')
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(request.cookies?.[this.auth.cookieName()]);
    response.cookie(this.auth.cookieName(), '', this.auth.clearCookieOptions());
    return ok(null);
  }

  @Get('me')
  async me(@Req() request: Request) {
    return ok(await this.identity.getRequiredCurrentUser(request));
  }
}
