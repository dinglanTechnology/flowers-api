import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toPublicUser,
  PublicUser,
} from '../../common/serializers/user.serializer';
import { WechatSecurityService } from '../../wechat/wechat-security.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { MeListQueryDto } from './dto/me-list.dto';

/** arrangement 快照里的花材数量（items 数组长度；后端对 JSON 只做这一处浅读取） */
function materialCountOf(arrangement: Prisma.JsonValue): number {
  const items = (arrangement as { items?: unknown[] } | null)?.items;
  return Array.isArray(items) ? items.length : 0;
}

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
    const exists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('用户不存在');
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
    });
    return toPublicUser(user);
  }

  /** 我的作品：封面 = 该作品最新 AI 图 ?? 创作台预览图；published 标记供删除确认文案 */
  async myWorks(userId: string, query: MeListQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.WorkWhereInput = { userId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.work.count({ where }),
      this.prisma.work.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    const ids = rows.map((w) => w.id);
    const [aiMap, published] = await Promise.all([
      this.latestAiImageMap(ids),
      ids.length
        ? this.prisma.plazaPost
            .findMany({
              where: { workId: { in: ids } },
              select: { workId: true },
            })
            .then((list) => new Set(list.map((p) => p.workId)))
        : new Set<string>(),
    ]);

    return {
      items: rows.map((w) => ({
        id: w.id,
        userId: w.userId,
        title: w.title,
        theme: w.theme,
        vaseId: w.vaseId,
        arrangement: w.arrangement,
        thumbnailUrl: w.thumbnailUrl,
        coverUrl: aiMap.get(w.id) ?? w.thumbnailUrl,
        materialCount: materialCountOf(w.arrangement),
        published: published.has(w.id),
        dateKey: w.dateKey,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
      })),
      total,
      page,
      size,
    };
  }

  /** 我的发布：封面 = 关联作品最新 AI 图 ?? 发布时快照图 */
  async myPosts(userId: string, query: MeListQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.PlazaPostWhereInput = { userId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.plazaPost.count({ where }),
      this.prisma.plazaPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    const workIds = rows.flatMap((p) => (p.workId ? [p.workId] : []));
    const aiMap = await this.latestAiImageMap(workIds);

    return {
      items: rows.map((p) => ({
        id: p.id,
        userId: p.userId,
        authorName: p.authorName,
        title: p.title,
        theme: p.theme,
        arrangement: p.arrangement,
        thumbnailUrl: p.thumbnailUrl,
        coverUrl:
          (p.workId ? aiMap.get(p.workId) : undefined) ?? p.thumbnailUrl,
        materialCount: materialCountOf(p.arrangement),
        likeCount: p.likeCount,
        viewCount: p.viewCount,
        workId: p.workId,
        auditStatus: p.auditStatus,
        createdAt: p.createdAt.toISOString(),
      })),
      total,
      page,
      size,
    };
  }

  /** 我的点赞：按点赞时间倒序；封面规则同上；取消赞走 POST /plaza/:id/like */
  async myLikes(userId: string, query: MeListQueryDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.PlazaLikeWhereInput = {
      userId,
      post: { auditStatus: 'approved' },
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.plazaLike.count({ where }),
      this.prisma.plazaLike.findMany({
        where,
        include: { post: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    const workIds = rows.flatMap((l) => (l.post.workId ? [l.post.workId] : []));
    const aiMap = await this.latestAiImageMap(workIds);

    return {
      items: rows.map((l) => {
        const p = l.post;
        return {
          id: p.id,
          userId: p.userId,
          authorName: p.authorName,
          title: p.title,
          theme: p.theme,
          arrangement: p.arrangement,
          thumbnailUrl: p.thumbnailUrl,
          coverUrl:
            (p.workId ? aiMap.get(p.workId) : undefined) ?? p.thumbnailUrl,
          materialCount: materialCountOf(p.arrangement),
          likeCount: p.likeCount,
          viewCount: p.viewCount,
          workId: p.workId,
          liked: true,
          likedAt: l.createdAt.toISOString(),
          createdAt: p.createdAt.toISOString(),
        };
      }),
      total,
      page,
      size,
    };
  }

  /**
   * 批量取一组作品的最新 AI 图（image2 succeeded，每作品第一张即最新）。
   * 不按 userId 过滤：workId 全局唯一，其 AI 任务必然属于作品作者
   * （「我的点赞」里大多是别人的作品，按当前用户过滤会查不到）。
   */
  private async latestAiImageMap(
    workIds: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!workIds.length) return map;
    const tasks = await this.prisma.aiTask.findMany({
      where: {
        workId: { in: workIds },
        type: 'image2',
        status: 'succeeded',
      },
      orderBy: { createdAt: 'desc' },
      select: { workId: true, resultUrl: true },
    });
    for (const t of tasks) {
      if (t.workId && t.resultUrl && !map.has(t.workId)) {
        map.set(t.workId, t.resultUrl);
      }
    }
    return map;
  }
}
