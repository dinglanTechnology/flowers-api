import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * 全局鉴权守卫（P1 在 app.module 注册为 APP_GUARD 后生效）。
 * 校验 Authorization: Bearer <jwt>，把 { userId, openid } 挂到 request.user。
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    // 公开接口：不强制登录；但若带了有效 token 仍解析出用户，
    // 便于广场 feed 等公开接口对登录用户标注个性化状态（如 liked）。
    if (isPublic) {
      if (token) await this.tryAttachUser(request, token);
      return true;
    }

    if (!token) throw new UnauthorizedException('缺少访问令牌');
    if (!(await this.tryAttachUser(request, token))) {
      throw new UnauthorizedException('令牌无效或已过期');
    }
    return true;
  }

  /** 校验 token 并把 { userId, openid } 挂到 request.user；成功返回 true */
  private async tryAttachUser(
    request: Request,
    token: string,
  ): Promise<boolean> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        openid?: string;
      }>(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      (request as Request & { user: unknown }).user = {
        userId: payload.sub,
        openid: payload.openid,
      };
      return true;
    } catch {
      return false;
    }
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
