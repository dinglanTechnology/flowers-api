import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toPublicUser, PublicUser } from '../../common/serializers/user.serializer';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');
    return toPublicUser(user);
  }

  async updateMe(userId: string, dto: UpdateUserDto): Promise<PublicUser> {
    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    return toPublicUser(user);
  }
}
