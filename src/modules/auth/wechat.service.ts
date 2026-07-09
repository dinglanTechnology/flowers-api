import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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

/** 微信小程序服务端：code2session 换取 openid */
@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  constructor(private readonly config: ConfigService) {}

  async code2session(code: string): Promise<WechatSession> {
    const appId = this.config.get<string>('wechat.appId');
    const secret = this.config.get<string>('wechat.secret');
    if (!appId || !secret) {
      throw new BadRequestException('微信 appid/secret 未配置');
    }

    const url =
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${secret}` +
      `&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;

    const res = await fetch(url);
    const data = (await res.json()) as Code2SessionResponse;

    if (!data.openid || data.errcode) {
      this.logger.warn(`code2session 失败: ${data.errcode ?? ''} ${data.errmsg ?? ''}`);
      throw new BadRequestException(`微信登录失败: ${data.errmsg ?? 'code 无效'}`);
    }

    return {
      openid: data.openid,
      unionid: data.unionid,
      sessionKey: data.session_key ?? '',
    };
  }
}
