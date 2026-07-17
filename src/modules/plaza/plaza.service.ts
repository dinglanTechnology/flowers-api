import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PlazaPost } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WechatSecurityService } from '../../wechat/wechat-security.service';
import { secondsToNextMidnight, todayKey } from '../../common/utils/day.util';
import { aiThumbOf } from '../../common/utils/image.util';
import {
  PlazaFeedDto,
  PlazaSort,
  SharePlazaDto,
  ViewPlazaDto,
} from './dto/plaza.dto';

function toPlazaDto(p: PlazaPost, liked = false) {
  return {
    id: p.id,
    userId: p.userId,
    authorName: p.authorName,
    title: p.title,
    theme: p.theme,
    arrangement: p.arrangement,
    thumbnailUrl: p.thumbnailUrl, // 原图快照（详情/下载等高清场景）
    // 列表小图（480px webp）；非 AI 来源（创作台快照）无缩略图，前端回退 thumbnailUrl
    thumbUrl: aiThumbOf(p.thumbnailUrl),
    likeCount: p.likeCount,
    viewCount: p.viewCount,
    workId: p.workId,
    liked,
    auditStatus: p.auditStatus,
    createdAt: p.createdAt.toISOString(),
  };
}

/** feed 三种排序的 orderBy 映射，tie-break 严格按需求约定 */
const SORT_ORDER_BY: Record<
  PlazaSort,
  Prisma.PlazaPostOrderByWithRelationInput[]
> = {
  latest: [{ createdAt: 'desc' }, { likeCount: 'desc' }],
  mostLiked: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
  hottest: [
    { viewCount: 'desc' },
    { likeCount: 'desc' },
    { createdAt: 'desc' },
  ],
};

@Injectable()
export class PlazaService {
  private readonly logger = new Logger(PlazaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: WechatSecurityService,
    private readonly redis: RedisService,
  ) {}

  async feed(userId: string | undefined, query: PlazaFeedDto) {
    const page = query.page ?? 1;
    const size = query.size ?? 20;
    const where: Prisma.PlazaPostWhereInput = { auditStatus: 'approved' };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.plazaPost.count({ where }),
      this.prisma.plazaPost.findMany({
        where,
        orderBy: SORT_ORDER_BY[query.sort ?? 'latest'],
        skip: (page - 1) * size,
        take: size,
      }),
    ]);

    // 一次查出当前用户在本页里点过赞的帖子，标注 liked。
    // 未登录（无 userId）时跳过：否则 Prisma 会把 userId:undefined 当作不过滤，误标全部为已赞。
    const likedSet =
      userId && rows.length
        ? new Set(
            (
              await this.prisma.plazaLike.findMany({
                where: { userId, postId: { in: rows.map((p) => p.id) } },
                select: { postId: true },
              })
            ).map((l) => l.postId),
          )
        : new Set<string>();

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

    const title = dto.title;
    let theme: string;
    let arrangement: Prisma.InputJsonValue;
    let thumbnailUrl: string | null;
    let workId: string | null = null;

    if (dto.workId) {
      const work = await this.prisma.work.findUnique({
        where: { id: dto.workId },
      });
      if (!work) throw new NotFoundException('作品不存在');
      if (work.userId !== userId)
        throw new ForbiddenException('无权分享该作品');
      workId = work.id;
      theme = work.theme;
      arrangement = work.arrangement as Prisma.InputJsonValue;
      // 发布展示图优先取该作品最新一张 AI 图，没有则用创作台预览图
      thumbnailUrl =
        (await this.latestAiImageUrl(userId, work.id)) ?? work.thumbnailUrl;
    } else {
      if (!dto.theme || !dto.arrangement) {
        throw new BadRequestException(
          '缺少 workId 或作品信息（theme/arrangement）',
        );
      }
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
        workId,
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

  /** 撤回发布：仅作者本人；点赞记录随 PlazaLike 的 Cascade 一并清理 */
  async remove(userId: string, id: string) {
    const post = await this.prisma.plazaPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('发布不存在');
    if (post.userId !== userId) throw new ForbiddenException('无权撤回该发布');
    await this.prisma.plazaPost.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * 浏览量上报（作品详情曝光）：同一 viewer（登录按 userId、匿名按 anonId）
   * 对同一帖子每个自然日（Asia/Shanghai）最多计 1 次。
   * Redis 去重 + DB 冗余计数；Redis 故障时降级为直接计数（宁可多计不丢计）。
   */
  async recordView(userId: string | undefined, id: string, dto: ViewPlazaDto) {
    const post = await this.prisma.plazaPost.findUnique({ where: { id } });
    if (!post || post.auditStatus !== 'approved')
      throw new NotFoundException('作品不存在');

    const viewer = userId
      ? `u:${userId}`
      : dto.anonId
        ? `a:${dto.anonId}`
        : null;
    if (!viewer) throw new BadRequestException('缺少访客标识');

    let counted = true;
    try {
      const key = `pv:${todayKey()}:${id}:${viewer}`;
      const set = await this.redis.set(
        key,
        '1',
        'EX',
        secondsToNextMidnight() + 300,
        'NX',
      );
      counted = set === 'OK';
    } catch (err) {
      this.logger.warn(`浏览去重 Redis 异常，降级直接计数: ${String(err)}`);
    }

    if (counted) {
      const updated = await this.prisma.plazaPost.update({
        where: { id },
        data: { viewCount: { increment: 1 } },
      });
      return { counted: true, viewCount: updated.viewCount };
    }
    return { counted: false, viewCount: post.viewCount };
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

  /** 某作品最新一张 succeeded 的 image2 成品图（原图）URL，无则 null */
  private async latestAiImageUrl(
    userId: string,
    workId: string,
  ): Promise<string | null> {
    const task = await this.prisma.aiTask.findFirst({
      where: { userId, workId, type: 'image2', status: 'succeeded' },
      orderBy: { createdAt: 'desc' },
      select: { resultUrl: true },
    });
    return task?.resultUrl ?? null;
  }
}
