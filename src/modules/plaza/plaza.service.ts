import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PlazaPost } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WechatSecurityService } from '../../wechat/wechat-security.service';
import { PlazaFeedDto, SharePlazaDto } from './dto/plaza.dto';

function toPlazaDto(p: PlazaPost) {
  return {
    id: p.id,
    userId: p.userId,
    authorName: p.authorName,
    title: p.title,
    theme: p.theme,
    arrangement: p.arrangement,
    thumbnailUrl: p.thumbnailUrl,
    likeCount: p.likeCount,
    auditStatus: p.auditStatus,
    createdAt: p.createdAt.toISOString(),
  };
}

@Injectable()
export class PlazaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly security: WechatSecurityService,
  ) {}

  async feed(query: PlazaFeedDto) {
    const limit = query.limit ?? 20;
    const rows = await this.prisma.plazaPost.findMany({
      where: { auditStatus: 'approved' },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map(toPlazaDto),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async share(userId: string, dto: SharePlazaDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('用户不存在');

    let title: string;
    let theme: string;
    let arrangement: Prisma.InputJsonValue;
    let thumbnailUrl: string | null;

    if (dto.workId) {
      const work = await this.prisma.work.findUnique({ where: { id: dto.workId } });
      if (!work) throw new NotFoundException('作品不存在');
      if (work.userId !== userId) throw new ForbiddenException('无权分享该作品');
      title = work.title;
      theme = work.theme;
      arrangement = work.arrangement as Prisma.InputJsonValue;
      thumbnailUrl = work.thumbnailUrl;
    } else {
      if (!dto.title || !dto.theme || !dto.arrangement) {
        throw new BadRequestException('缺少 workId 或作品信息（title/theme/arrangement）');
      }
      title = dto.title;
      theme = dto.theme;
      arrangement = dto.arrangement as Prisma.InputJsonValue;
      thumbnailUrl = dto.thumbnail ?? null;
    }

    // 微信内容审核
    if (!(await this.security.checkText(title, user.openid))) {
      throw new BadRequestException('标题未通过内容审核');
    }
    if (!(await this.security.checkImage(thumbnailUrl, user.openid))) {
      throw new BadRequestException('图片未通过内容审核');
    }

    const post = await this.prisma.plazaPost.create({
      data: {
        userId,
        authorName: user.nickname || '匿名花友',
        title,
        theme,
        arrangement,
        thumbnailUrl,
        auditStatus: 'approved',
      },
    });
    return toPlazaDto(post);
  }

  async getById(id: string) {
    const post = await this.prisma.plazaPost.findUnique({ where: { id } });
    if (!post || post.auditStatus !== 'approved') throw new NotFoundException('作品不存在');
    return toPlazaDto(post);
  }

  async like(id: string) {
    const post = await this.prisma.plazaPost
      .update({ where: { id }, data: { likeCount: { increment: 1 } } })
      .catch(() => {
        throw new NotFoundException('作品不存在');
      });
    return { likeCount: post.likeCount };
  }
}
