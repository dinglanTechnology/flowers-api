import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';

/** Web 端令牌 Cookie 名 */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/** 将 '30d' / '2h' / '15m' / '60s' 或纯数字（秒）解析为毫秒 */
function toMs(value: string, fallbackMs: number): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  const mult: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * (mult[unit] ?? 1000);
}

/**
 * 令牌 Cookie 下发/清除（Web 端 httpOnly 存储）。
 * 小程序不读 Cookie，故设置对其无副作用；两端登录接口共用。
 */
@Injectable()
export class CookieService {
  constructor(private readonly config: ConfigService) {}

  private baseOptions(): CookieOptions {
    // development（localhost 联调）强制 host-only Cookie（不下发 domain 属性）：
    // 浏览器会拒绝 Domain=localhost/IP 的 Cookie，只有不带 domain 才能种上
    const isDev = this.config.get<string>('nodeEnv') === 'development';
    return {
      httpOnly: true,
      secure: this.config.get<boolean>('cookie.secure') ?? false,
      sameSite:
        this.config.get<'lax' | 'strict' | 'none'>('cookie.sameSite') ?? 'lax',
      domain: isDev ? undefined : this.config.get<string>('cookie.domain'),
      path: '/',
    };
  }

  /** 登录/刷新后写入 access + refresh 两个 httpOnly Cookie */
  setAuth(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ): void {
    const base = this.baseOptions();
    // 有效期以 configuration.ts 为单一来源；缺失即配置错误，getOrThrow 响亮报错
    const accessMs = toMs(
      this.config.getOrThrow<string>('jwt.accessExpiresIn'),
      7_200_000,
    );
    const refreshMs = toMs(
      this.config.getOrThrow<string>('jwt.refreshExpiresIn'),
      2_592_000_000,
    );
    res.cookie(ACCESS_COOKIE, tokens.accessToken, {
      ...base,
      maxAge: accessMs,
    });
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      maxAge: refreshMs,
    });
  }

  /** 登出：清除两个令牌 Cookie（选项须与写入时一致才能覆盖删除） */
  clearAuth(res: Response): void {
    const base = this.baseOptions();
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
  }
}
