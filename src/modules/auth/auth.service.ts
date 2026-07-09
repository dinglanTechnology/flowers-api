import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toPublicUser,
  PublicUser,
} from '../../common/serializers/user.serializer';
import { WechatService } from './wechat.service';
import { TokenService } from './token.service';
import { WechatLoginDto } from './dto/wechat-login.dto';

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
