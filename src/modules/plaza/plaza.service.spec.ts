import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlazaService } from './plaza.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WechatSecurityService } from '../../wechat/wechat-security.service';

/** 最小 PlazaPost 形（只取 service 用到/序列化到的字段） */
function fakePost(over: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    userId: 'author1',
    authorName: '花友',
    title: '今日花事',
    theme: 'night',
    arrangement: { items: [] },
    thumbnailUrl: 'https://oss/t.png',
    likeCount: 2,
    viewCount: 10,
    workId: 'w1',
    auditStatus: 'approved',
    createdAt: new Date('2026-07-16T08:00:00.000Z'),
    ...over,
  };
}

describe('PlazaService（feed 排序 / 浏览量上报）', () => {
  const postFindMany = jest.fn();
  const postFindUnique = jest.fn();
  const postCount = jest.fn();
  const postUpdate = jest.fn();
  const transaction = jest.fn();
  const redisSet = jest.fn();

  const prisma = {
    plazaPost: {
      findMany: postFindMany,
      findUnique: postFindUnique,
      count: postCount,
      update: postUpdate,
    },
    plazaLike: { findMany: jest.fn(), findUnique: jest.fn() },
    $transaction: transaction,
  } as unknown as PrismaService;
  const security = {
    checkText: jest.fn().mockResolvedValue(true),
    checkImage: jest.fn().mockResolvedValue(true),
  } as unknown as WechatSecurityService;
  const redis = { set: redisSet } as unknown as RedisService;
  const svc = new PlazaService(prisma, security, redis);

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation((arr: Promise<unknown>[]) =>
      Promise.all(arr),
    );
    postCount.mockResolvedValue(0);
    postFindMany.mockResolvedValue([]);
  });

  it.each([
    ['latest', [{ createdAt: 'desc' }, { likeCount: 'desc' }]],
    ['mostLiked', [{ likeCount: 'desc' }, { createdAt: 'desc' }]],
    [
      'hottest',
      [{ viewCount: 'desc' }, { likeCount: 'desc' }, { createdAt: 'desc' }],
    ],
  ] as const)(
    'sort=%s 时 orderBy 符合需求 tie-break',
    async (sort, orderBy) => {
      await svc.feed(undefined, { sort });
      expect(postFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy }),
      );
    },
  );

  it('不传 sort 默认 latest', async () => {
    await svc.feed(undefined, {});
    expect(postFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { likeCount: 'desc' }],
      }),
    );
  });

  it('当日首次曝光：计 1 次并返回最新 viewCount', async () => {
    postFindUnique.mockResolvedValue(fakePost());
    redisSet.mockResolvedValue('OK');
    postUpdate.mockResolvedValue(fakePost({ viewCount: 11 }));

    const res = await svc.recordView('u9', 'p1', {});
    expect(res).toEqual({ counted: true, viewCount: 11 });
    expect(postUpdate).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('当日重复曝光：不计数，返回原 viewCount', async () => {
    postFindUnique.mockResolvedValue(fakePost());
    redisSet.mockResolvedValue(null); // NX 已存在

    const res = await svc.recordView(undefined, 'p1', { anonId: 'dev-1' });
    expect(res).toEqual({ counted: false, viewCount: 10 });
    expect(postUpdate).not.toHaveBeenCalled();
  });

  it('未登录且未传 anonId → 400', async () => {
    postFindUnique.mockResolvedValue(fakePost());
    await expect(svc.recordView(undefined, 'p1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('帖子不存在 / 未过审 → 404', async () => {
    postFindUnique.mockResolvedValue(null);
    await expect(svc.recordView('u1', 'p1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
    postFindUnique.mockResolvedValue(fakePost({ auditStatus: 'pending' }));
    await expect(svc.recordView('u1', 'p1', {})).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('Redis 异常时降级直接计数（宁可多计不丢计）', async () => {
    postFindUnique.mockResolvedValue(fakePost());
    redisSet.mockRejectedValue(new Error('redis down'));
    postUpdate.mockResolvedValue(fakePost({ viewCount: 11 }));

    const res = await svc.recordView('u1', 'p1', {});
    expect(res.counted).toBe(true);
    expect(postUpdate).toHaveBeenCalled();
  });
});
