import { WorksService } from './works.service';
import { PrismaService } from '../../prisma/prisma.service';

const WORK = {
  id: 'w1',
  userId: 'u1',
  title: '今日花事',
  theme: 'night',
  vaseId: 'mat-vase-ink',
  arrangement: { items: [{ matId: 'a' }] },
  thumbnailUrl: 'https://oss/preview.png',
  dateKey: '2026-07-16',
  createdAt: new Date('2026-07-16T08:00:00.000Z'),
  updatedAt: new Date('2026-07-16T09:00:00.000Z'),
};

function aiTask(id: string, iso: string) {
  return {
    id,
    resultUrl: `https://oss/ai/${id}.png`,
    createdAt: new Date(iso),
  };
}

describe('WorksService.images（下载弹窗图片列表）', () => {
  const workFindUnique = jest.fn();
  const aiFindMany = jest.fn();
  const prisma = {
    work: { findUnique: workFindUnique },
    aiTask: { findMany: aiFindMany },
  } as unknown as PrismaService;
  const svc = new WorksService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    workFindUnique.mockResolvedValue({ ...WORK });
  });

  it('AI 图新→旧在前，创作台预览图垫底', async () => {
    // findMany 按 createdAt desc 返回（t2 更新在前）
    aiFindMany.mockResolvedValue([
      aiTask('t2', '2026-07-16T11:00:00.000Z'),
      aiTask('t1', '2026-07-16T10:00:00.000Z'),
    ]);

    const { images } = await svc.images('u1', 'w1');
    expect(images.map((i) => i.type)).toEqual(['ai', 'ai', 'preview']);
    expect(images[0]).toMatchObject({
      taskId: 't2',
      url: 'https://oss/ai/t2.png',
    });
    expect(images[2].url).toBe('https://oss/preview.png');
    expect(images[2].taskId).toBeUndefined();
  });

  it('无 AI 图时只返回预览图（前端隐藏缩略图区）', async () => {
    aiFindMany.mockResolvedValue([]);
    const { images } = await svc.images('u1', 'w1');
    expect(images).toHaveLength(1);
    expect(images[0].type).toBe('preview');
  });

  it('作品无预览图且无 AI 图时返回空列表', async () => {
    workFindUnique.mockResolvedValue({ ...WORK, thumbnailUrl: null });
    aiFindMany.mockResolvedValue([]);
    const { images } = await svc.images('u1', 'w1');
    expect(images).toEqual([]);
  });

  it('非本人作品 → 403', async () => {
    workFindUnique.mockResolvedValue({ ...WORK, userId: 'someone-else' });
    await expect(svc.images('u1', 'w1')).rejects.toMatchObject({
      status: 403,
    });
  });
});
