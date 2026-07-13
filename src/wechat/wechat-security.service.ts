import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 微信内容安全审核（UGC 上广场要求）。未配置 appid/secret 时放行（便于开发）。 */
@Injectable()
export class WechatSecurityService {
  private readonly logger = new Logger(WechatSecurityService.name);
  private readonly appId: string;
  private readonly secret: string;
  private cachedToken = '';
  private tokenExpireAt = 0;

  constructor(config: ConfigService) {
    this.appId = config.get<string>('wechat.appId') ?? '';
    this.secret = config.get<string>('wechat.secret') ?? '';
  }

  private configured(): boolean {
    return Boolean(this.appId && this.secret);
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpireAt)
      return this.cachedToken;
    const url =
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential` +
      `&appid=${this.appId}&secret=${this.secret}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) throw new Error('获取微信 access_token 失败');
    this.cachedToken = data.access_token;
    this.tokenExpireAt = Date.now() + ((data.expires_in ?? 7200) - 300) * 1000;
    return this.cachedToken;
  }

  /**
   * 文本审核（msg_sec_check）。返回是否通过。
   * openid 缺省（Web 手机号用户）时无法调用微信审核，短期显式放行并记日志。
   * TODO(P0-3 中期): Web 用户改走阿里云内容安全 Green（textScan）。
   */
  async checkText(
    content: string,
    openid?: string | null,
  ): Promise<boolean> {
    if (!openid) {
      this.logger.warn('无 openid（Web 用户），跳过微信文本审核');
      return true;
    }
    if (!this.configured()) {
      this.logger.warn('微信未配置，跳过文本审核');
      return true;
    }
    try {
      const token = await this.getAccessToken();
      const res = await fetch(
        `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 2, openid, scene: 1, content }),
        },
      );
      const data = (await res.json()) as {
        errcode?: number;
        result?: { suggest?: string };
      };
      if (data.errcode && data.errcode !== 0) {
        this.logger.warn(`msg_sec_check 异常 errcode=${data.errcode}，放行`);
        return true;
      }
      return data?.result?.suggest !== 'risky';
    } catch (error) {
      this.logger.warn(`文本审核调用失败，放行: ${(error as Error).message}`);
      return true;
    }
  }

  /** 图片审核。TODO(P4): 接入 media_check_async 异步审核 + 回调；当前放行。 */
  checkImage(
    _imageUrl: string | null,
    _openid?: string | null,
  ): Promise<boolean> {
    return Promise.resolve(true);
  }
}
