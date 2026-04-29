import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { UnauthorizedError } from '../common/errors';
import { TokenService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest();
    const auth = String(request.headers.authorization ?? '');
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new UnauthorizedError('Current request is not authenticated');
    request.authenticatedUser = this.tokenService.verifyAccessToken(token);
    return true;
  }
}
