import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

export interface WechatSession {
  openid: string;
  unionid?: string;
  sessionKey: string;
}

interface Code2SessionResponse {
  openid?: string;
  unionid?: string;
  session_key?: string;
  errcode?: number;
  errmsg?: string;
}

interface StableTokenResponse {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
}

interface GetPhoneResponse {
  errcode?: number;
  errmsg?: string;
  phone_info?: {
    phoneNumber: string;
    purePhoneNumber: string;
    countryCode: string;
  };
}

/** 小程序全局 access_token 的 Redis 缓存 key */
const ACCESS_TOKEN_KEY = 'wx:access_token';
/** 微信接口请求超时 */
const REQUEST_TIMEOUT_MS = 8000;

/** 微信小程序服务端：code2session、access_token 管理、手机号获取 */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private credentials(): { appId: string; secret: string } {
    const appId = this.config.get<string>('wechat.appId');
    const secret = this.config.get<string>('wechat.secret');
    if (!appId || !secret) {
      throw new BadRequestException('微信 appid/secret 未配置');
    }
    return { appId, secret };
  }

  private async fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return (await res.json()) as T;
  }

  /** 用登录 code 换取 openid / unionid / session_key */
  async code2session(code: string): Promise<WechatSession> {
    const { appId, secret } = this.credentials();

    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}` +
      `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    let data: Code2SessionResponse;
    try {
      data = await this.fetchJson<Code2SessionResponse>(url);
    } catch (err) {
      this.logger.error(`code2session 请求异常: ${(err as Error).message}`);
      throw new BadRequestException('微信登录服务暂不可用，请重试');
    }

    if (!data.openid || data.errcode) {
      this.logger.warn(
        `code2session 失败: ${data.errcode ?? ''} ${data.errmsg ?? ''}`,
      );
      throw new BadRequestException(
        `微信登录失败: ${data.errmsg ?? 'code 无效'}`,
      );
    }

    return {
      openid: data.openid,
      unionid: data.unionid,
      sessionKey: data.session_key ?? '',
    };
  }

  /**
   * 获取小程序全局 access_token（stable_token 接口），带 Redis 缓存并在过期前自动刷新。
   * 用于调用手机号、内容安全等服务端接口。
   */
  async getStableAccessToken(): Promise<string> {
    const cached = await this.redis.get(ACCESS_TOKEN_KEY);
    if (cached) return cached;

    const { appId, secret } = this.credentials();

    let data: StableTokenResponse;
    try {
      data = await this.fetchJson<StableTokenResponse>(
        'https://api.weixin.qq.com/cgi-bin/stable_token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'client_credential',
            appid: appId,
            secret,
          }),
        },
      );
    } catch (err) {
      this.logger.error(
        `获取 access_token 请求异常: ${(err as Error).message}`,
      );
      throw new BadRequestException('微信服务暂不可用，请重试');
    }

    if (!data.access_token || data.errcode) {
      this.logger.error(
        `获取 access_token 失败: ${data.errcode ?? ''} ${data.errmsg ?? ''}`,
      );
      throw new BadRequestException('获取微信凭证失败');
    }

    // 提前 5 分钟过期，避免边界期用到失效 token
    const ttl = Math.max((data.expires_in ?? 7200) - 300, 60);
    await this.redis.set(ACCESS_TOKEN_KEY, data.access_token, 'EX', ttl);
    return data.access_token;
  }

  /** 用前端 getPhoneNumber 返回的 code 换取用户手机号（新版，无需解密） */
  async getPhoneNumber(phoneCode: string): Promise<string> {
    const accessToken = await this.getStableAccessToken();

    let data: GetPhoneResponse;
    try {
      data = await this.fetchJson<GetPhoneResponse>(
        `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: phoneCode }),
        },
      );
    } catch (err) {
      this.logger.error(`获取手机号请求异常: ${(err as Error).message}`);
      throw new BadRequestException('获取手机号失败，请重试');
    }

    const phone = data.phone_info?.purePhoneNumber;
    if (!phone || data.errcode) {
      this.logger.warn(
        `获取手机号失败: ${data.errcode ?? ''} ${data.errmsg ?? ''}`,
      );
      throw new BadRequestException(
        `获取手机号失败: ${data.errmsg ?? 'code 无效'}`,
      );
    }

    return phone;
  }
}
