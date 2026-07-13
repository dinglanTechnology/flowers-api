import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { RedisService } from '../../redis/redis.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** refresh token 在 Redis 中的 key 前缀（存的是 token 的 sha256，明文不落库） */
const REFRESH_PREFIX = 'refresh:';

/** 将 '30d' / '2h' / '15m' / '60s' 或纯数字（秒）解析为秒 */
function toSeconds(value: string): number {
  const m = /^(\d+)\s*([smhd])?$/.exec(value.trim());
  if (!m) return 2592000; // 兜底 30d
  const n = Number(m[1]);
  const unit = m[2] ?? 's';
  const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (mult[unit] ?? 1);
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtl(): number {
    return toSeconds(this.config.get<string>('jwt.refreshExpiresIn') ?? '30d');
  }

  /**
   * 签发 access + refresh 令牌对，并将 refresh 落库 Redis。
   * openid 可选：微信用户带 openid，Web 手机号用户无 openid（缺省时不写入 JWT / Redis）。
   */
  async issue(user: { id: string; openid?: string | null }): Promise<TokenPair> {
    // openid 缺省时不写入 payload，避免 web 用户携带 openid=undefined
    const payload: { sub: string; openid?: string } = { sub: user.id };
    if (user.openid) payload.openid = user.openid;

    const accessToken = await this.jwt.signAsync(payload, {
      // 值形如 '2h'，由 @nestjs/jwt 内部 ms() 解析；转型以满足类型
      expiresIn: (this.config.get<string>('jwt.accessExpiresIn') ??
        '2h') as unknown as number,
    });

    const refreshToken = randomBytes(32).toString('base64url');
    // 值里带上 openid（若有），轮换时无需回查数据库
    const refreshValue: { id: string; openid?: string } = { id: user.id };
    if (user.openid) refreshValue.openid = user.openid;
    await this.redis.set(
      REFRESH_PREFIX + this.hash(refreshToken),
      JSON.stringify(refreshValue),
      'EX',
      this.refreshTtl(),
    );

    return { accessToken, refreshToken };
  }

  /** 校验并轮换 refresh token：旧的立即失效，返回新令牌对 */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const key = REFRESH_PREFIX + this.hash(refreshToken);
    // 原子取出并删除，防止同一 refresh 被并发复用
    const raw = await this.redis.getdel(key);
    if (!raw) {
      throw new UnauthorizedException('refresh token 无效或已过期');
    }

    const user = JSON.parse(raw) as { id: string; openid?: string };
    return this.issue(user);
  }

  /** 主动吊销一个 refresh token（登出） */
  async revoke(refreshToken: string): Promise<void> {
    await this.redis.del(REFRESH_PREFIX + this.hash(refreshToken));
  }
}
