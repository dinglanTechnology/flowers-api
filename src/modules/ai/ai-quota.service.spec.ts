import { HttpException } from '@nestjs/common';
import { AiQuotaService, AI_IMAGE2_DAILY_LIMIT } from './ai-quota.service';
import { PrismaService } from '../../prisma/prisma.service';

type GroupRow = { status: string; _count: { _all: number } };

function rows(used: number, pending = 0, running = 0): GroupRow[] {
  const out: GroupRow[] = [];
  if (used) out.push({ status: 'succeeded', _count: { _all: used } });
  if (pending) out.push({ status: 'pending', _count: { _all: pending } });
  if (running) out.push({ status: 'running', _count: { _all: running } });
  return out;
}

describe('AiQuotaService（image2 每日额度，按 AiTask 状态统计）', () => {
  const groupBy = jest.fn<Promise<GroupRow[]>, [args?: unknown]>();
  const prisma = { aiTask: { groupBy } } as unknown as PrismaService;
  const svc = new AiQuotaService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    groupBy.mockResolvedValue([]);
  });

  it('今日已成功 5 次 → 429，文案与前端 toast 严格一致', async () => {
    groupBy.mockResolvedValue(rows(5));
    const err: unknown = await svc
      .assertAvailable('u1', 'w1')
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    const httpErr = err as HttpException;
    expect(httpErr.getStatus()).toBe(429);
    expect(httpErr.getResponse()).toBe(
      '今日 AI 生成额度已用完（5/5），明天再来试试吧',
    );
  });

  it('成功 3 + 在途 2（pending/running 混合）→ 429', async () => {
    groupBy.mockResolvedValue(rows(3, 1, 1));
    await expect(svc.assertAvailable('u1', 'w1')).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('成功 4 无在途 → 放行；失败任务不计（查询不含 failed）', async () => {
    groupBy.mockResolvedValue(rows(4));
    await expect(svc.assertAvailable('u1', null)).resolves.toBeUndefined();
    const arg = groupBy.mock.calls[0][0] as {
      where: { workId: string | null; status: { in: string[] } };
    };
    expect(arg.where.workId).toBeNull();
    expect(arg.where.status.in).toEqual(['pending', 'running', 'succeeded']);
  });

  it('remaining = 上限 - 成功 - 在途，下限 0', async () => {
    groupBy.mockResolvedValue(rows(2, 1));
    await expect(svc.remaining('u1', 'w1')).resolves.toBe(
      AI_IMAGE2_DAILY_LIMIT - 3,
    );
    groupBy.mockResolvedValue(rows(5, 1));
    await expect(svc.remaining('u1', 'w1')).resolves.toBe(0);
  });
});
