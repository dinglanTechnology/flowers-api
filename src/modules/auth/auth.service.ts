import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toPublicUser,
  PublicUser,
} from '../../common/serializers/user.serializer';
import { WechatService } from './wechat.service';
import { TokenService } from './token.service';
import { SmsService } from './sms.service';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { SmsLoginDto } from './dto/sms-login.dto';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechat: WechatService,
    private readonly tokens: TokenService,
    private readonly sms: SmsService,
  ) {}

  async wechatLogin(dto: WechatLoginDto): Promise<LoginResult> {
    const session = await this.wechat.code2session(dto.code);

    // 传了 phoneCode 则同步换取手机号（新版接口，无需解密）
    const phone = dto.phoneCode
      ? await this.wechat.getPhoneNumber(dto.phoneCode)
      : undefined;

    const user = await this.prisma.user.upsert({
      where: { openid: session.openid },
      update: {
        ...(dto.nickname ? { nickname: dto.nickname } : {}),
        ...(dto.avatarUrl ? { avatarUrl: dto.avatarUrl } : {}),
        ...(session.unionid ? { unionid: session.unionid } : {}),
        ...(phone ? { phone } : {}),
      },
      create: {
        openid: session.openid,
        unionid: session.unionid ?? null,
        nickname: dto.nickname ?? '',
        avatarUrl: dto.avatarUrl ?? null,
        phone: phone ?? null,
      },
    });

    const { accessToken, refreshToken } = await this.tokens.issue({
      id: user.id,
      openid: user.openid,
    });
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  /** Web 手机号登录：发送验证码（限流与降级逻辑在 SmsService） */
  async sendSmsCode(phone: string): Promise<void> {
    await this.sms.sendCode(phone);
  }

  /**
   * Web 手机号验证码登录。
   * 账号合并：phone 作为跨端统一身份键——若该 phone 已属于某微信账号则直接登入该账号，
   * 否则新建手机号账号（openid 留空、loginType='phone'）。
   */
  async smsLogin(dto: SmsLoginDto): Promise<LoginResult> {
    if (!(await this.sms.verifyCode(dto.phone, dto.code))) {
      throw new BadRequestException('验证码错误或已过期');
    }

    const user = await this.prisma.user.upsert({
      where: { phone: dto.phone },
      // 命中已有账号（含微信老账号）即直接登入，不覆盖其资料；昵称仅在建号时使用
      update: {},
      create: {
        phone: dto.phone,
        loginType: 'phone',
        nickname: dto.nickname ?? '',
      },
    });

    const { accessToken, refreshToken } = await this.tokens.issue({
      id: user.id,
      openid: user.openid,
    });
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  /** 用 refresh token 换新令牌对（旧 refresh 立即失效） */
  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.tokens.rotate(refreshToken);
  }

  /** 登出：吊销 refresh token */
  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }
}
