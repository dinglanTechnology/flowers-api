import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { todayStart } from '../../common/utils/day.util';

/** 每用户每作品每自然日（Asia/Shanghai）的 image2 生成上限 */
export const AI_IMAGE2_DAILY_LIMIT = 5;

/**
 * AI 出图（image2）每日额度：按 用户 × 作品（或 draft 草稿桶）× 自然日 计。
 * 直接按 AiTask 状态统计（单查询快照），不引入第二存储，保证计次即时一致：
 * - succeeded（今日创建）= 已消耗；pending/running = 在途占用
 * - 两者合计 ≥ 上限即拒；失败任务不计（满足「失败不扣」）
 * - 计次按任务创建日归属：昨日创建今日完成的任务不占用今日额度
 * cutout 抠图不受此额度限制。
 */
@Injectable()
export class AiQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  /** 今日已消耗（成功）与在途占用，单次 groupBy 快照保证一致 */
  private async counts(userId: string, workId: string | null) {
    const rows = await this.prisma.aiTask.groupBy({
      by: ['status'],
      where: {
        userId,
        workId,
        type: 'image2',
        createdAt: { gte: todayStart() },
        status: { in: ['pending', 'running', 'succeeded'] },
      },
      _count: { _all: true },
    });
    let used = 0;
    let active = 0;
    for (const r of rows) {
      if (r.status === 'succeeded') used = r._count._all;
      else active += r._count._all;
    }
    return { used, active };
  }

  /** 提交前卡控：成功 + 在途 ≥ 上限 → 429（文案与前端 toast 严格一致） */
  async assertAvailable(userId: string, workId: string | null): Promise<void> {
    const { used, active } = await this.counts(userId, workId);
    if (used + active >= AI_IMAGE2_DAILY_LIMIT) {
      throw new HttpException(
        `今日 AI 生成额度已用完（${AI_IMAGE2_DAILY_LIMIT}/${AI_IMAGE2_DAILY_LIMIT}），明天再来试试吧`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** 剩余可发起次数（含在途占用），供提交响应/任务查询展示「今日还剩 X 次」 */
  async remaining(userId: string, workId: string | null): Promise<number> {
    const { used, active } = await this.counts(userId, workId);
    return Math.max(0, AI_IMAGE2_DAILY_LIMIT - used - active);
  }
}
