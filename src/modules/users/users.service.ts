import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toPublicUser,
  PublicUser,
} from '../../common/serializers/user.serializer';
import { WechatSecurityService } from '../../wechat/wechat-security.service';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: WechatSecurityService,
  ) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    return toPublicUser(user);
  }

  async updateMe(
    userId: string,
    openid: string,
    dto: UpdateUserDto,
  ): Promise<PublicUser> {
    // 昵称是 UGC，先过微信文本审核
    if (
      dto.nickname &&
      !(await this.security.checkText(dto.nickname, openid))
    ) {
      throw new BadRequestException('昵称未通过内容审核');
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return toPublicUser(user);
  }
}
