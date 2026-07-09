import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicUser, PublicUser } from '../../common/serializers/user.serializer';
import { WechatService } from './wechat.service';
import { WechatLoginDto } from './dto/wechat-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly wechat: WechatService,
  ) {}

  async wechatLogin(dto: WechatLoginDto): Promise<{ accessToken: string; user: PublicUser }> {
    const session = await this.wechat.code2session(dto.code);

    const user = await this.prisma.user.upsert({
      where: { openid: session.openid },
      update: {
        ...(dto.nickname ? { nickname: dto.nickname } : {}),
        ...(dto.avatarUrl ? { avatarUrl: dto.avatarUrl } : {}),
        ...(session.unionid ? { unionid: session.unionid } : {}),
      },
      create: {
        openid: session.openid,
        unionid: session.unionid ?? null,
        nickname: dto.nickname ?? '',
        avatarUrl: dto.avatarUrl ?? null,
      },
    });

    const accessToken = await this.jwt.signAsync({ sub: user.id, openid: user.openid });
    return { accessToken, user: toPublicUser(user) };
  }
}
