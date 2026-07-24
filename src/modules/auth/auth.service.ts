import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

    const user = await this.resolveWechatUser({
      openid: session.openid,
      unionid: session.unionid,
      phone,
      nickname: dto.nickname,
      avatarUrl: dto.avatarUrl,
    });

    const { accessToken, refreshToken } = await this.tokens.issue({
      id: user.id,
      openid: user.openid,
    });
    return { accessToken, refreshToken, user: toPublicUser(user) };
  }

  /**
   * 微信建号 / 登录。phone 为跨端统一身份键：
   * - 无 phone：按 openid upsert
   * - 有 phone 且已有 Web 手机号账号（openid 为空）：并入该账号并绑定 openid
   * - 有 phone 且已被其他 openid 占用：400
   * - openid 账号与 phone 账号并存时：把 phone 迁到 openid 账号（先清空旧绑定）
   */
  private async resolveWechatUser(input: {
    openid: string;
    unionid?: string;
    phone?: string;
    nickname?: string;
    avatarUrl?: string;
  }) {
    const { openid, unionid, phone, nickname, avatarUrl } = input;
    const profile = {
      ...(nickname ? { nickname } : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
      ...(unionid ? { unionid } : {}),
    };

    const byOpenid = await this.prisma.user.findUnique({ where: { openid } });
    const byPhone = phone
      ? await this.prisma.user.findUnique({ where: { phone } })
      : null;

    if (byPhone?.openid && byPhone.openid !== openid) {
      throw new BadRequestException('该手机号已绑定其他微信账号');
    }

    try {
      // Web 手机号账号尚无 openid：把微信身份绑上去（跨端合并）
      if (byPhone && !byPhone.openid) {
        if (byOpenid && byOpenid.id !== byPhone.id) {
          // 已有纯微信账号 + 纯手机号账号：phone 迁到微信账号，避免双号并存冲突
          return await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: byPhone.id },
              data: { phone: null },
            });
            return tx.user.update({
              where: { id: byOpenid.id },
              data: { ...profile, phone },
            });
          });
        }
        return await this.prisma.user.update({
          where: { id: byPhone.id },
          data: {
            ...profile,
            openid,
            loginType: 'wechat',
            ...(phone ? { phone } : {}),
          },
        });
      }

      if (byOpenid) {
        return await this.prisma.user.update({
          where: { id: byOpenid.id },
          data: { ...profile, ...(phone ? { phone } : {}) },
        });
      }

      return await this.prisma.user.create({
        data: {
          openid,
          unionid: unionid ?? null,
          nickname: nickname ?? '',
          avatarUrl: avatarUrl ?? null,
          phone: phone ?? null,
          loginType: 'wechat',
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException('账号绑定冲突，请重试或联系客服');
      }
      throw err;
    }
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
