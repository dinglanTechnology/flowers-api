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

function toPlazaDto(p: PlazaPost, liked = false) {
  return {
    id: p.id,
    userId: p.userId,
    authorName: p.authorName,
    title: p.title,
    theme: p.theme,
    arrangement: p.arrangement,
    thumbnailUrl: p.thumbnailUrl,
    likeCount: p.likeCount,
    liked,
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

  async feed(userId: string, query: PlazaFeedDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.PlazaPostWhereInput = { auditStatus: 'approved' };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.plazaPost.count({ where }),
      this.prisma.plazaPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    // 一次查出当前用户在本页里点过赞的帖子，标注 liked
    const likedSet = new Set(
      (
        await this.prisma.plazaLike.findMany({
          where: { userId, postId: { in: rows.map((p) => p.id) } },
          select: { postId: true },
        })
      ).map((l) => l.postId),
    );

    return {
      items: rows.map((p) => toPlazaDto(p, likedSet.has(p.id))),
      total,
      page,
      size,
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
      const work = await this.prisma.work.findUnique({
        where: { id: dto.workId },
      });
      if (!work) throw new NotFoundException('作品不存在');
      if (work.userId !== userId)
        throw new ForbiddenException('无权分享该作品');
      title = work.title;
      theme = work.theme;
      arrangement = work.arrangement as Prisma.InputJsonValue;
      thumbnailUrl = work.thumbnailUrl;
    } else {
      if (!dto.title || !dto.theme || !dto.arrangement) {
        throw new BadRequestException(
          '缺少 workId 或作品信息（title/theme/arrangement）',
        );
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

  async getById(userId: string, id: string) {
    const post = await this.prisma.plazaPost.findUnique({ where: { id } });
    if (!post || post.auditStatus !== 'approved')
      throw new NotFoundException('作品不存在');
    const liked = !!(await this.prisma.plazaLike.findUnique({
      where: { userId_postId: { userId, postId: id } },
    }));
    return toPlazaDto(post, liked);
  }

  /** 点赞/取消赞（幂等 toggle）：liked 表示本次操作后的状态 */
  async like(userId: string, id: string) {
    const post = await this.prisma.plazaPost.findUnique({ where: { id } });
    if (!post || post.auditStatus !== 'approved')
      throw new NotFoundException('作品不存在');

    const existing = await this.prisma.plazaLike.findUnique({
      where: { userId_postId: { userId, postId: id } },
    });

    if (existing) {
      // 取消赞：删记录 + 计数 -1（原子）
      const [, updated] = await this.prisma.$transaction([
        this.prisma.plazaLike.delete({ where: { id: existing.id } }),
        this.prisma.plazaPost.update({
          where: { id },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      return { likeCount: updated.likeCount, liked: false };
    }

    // 点赞：建记录 + 计数 +1（并发下靠唯一键兜底）
    try {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.plazaLike.create({ data: { userId, postId: id } }),
        this.prisma.plazaPost.update({
          where: { id },
          data: { likeCount: { increment: 1 } },
        }),
      ]);
      return { likeCount: updated.likeCount, liked: true };
    } catch (err) {
      // 并发重复点赞（唯一键冲突）：视为已赞，返回当前计数
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const fresh = await this.prisma.plazaPost.findUnique({ where: { id } });
        return { likeCount: fresh?.likeCount ?? post.likeCount, liked: true };
      }
      throw err;
    }
  }
}
