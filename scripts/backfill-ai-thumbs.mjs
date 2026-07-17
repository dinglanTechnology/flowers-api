/**
 * 一次性回填：给存量 AI 任务补生成缩略图，并把广场/作品里的 AI 图快照刷成缩略图。
 *
 * 背景：缩略图功能上线前的 succeeded 任务 thumbUrl 全为 NULL，
 * PlazaPost.thumbnailUrl / Work.thumbnailUrl 是发布时快照（原图或 base64 内联），
 * 只会随本回填更新，代码逻辑不会追溯改写。
 *
 * 步骤：
 *  1) 找出 thumbUrl 为 NULL 且 resultUrl 命中 ai/(image2|cutout)/*.png 的成功任务，
 *     下载原图 → sharp 缩 480px webp → 传 OSS（<key>_thumb.webp）→ 回写 AiTask.thumbUrl
 *  2) PlazaPost / Work 的 thumbnailUrl 中指向 ai/*.png 的，SQL 替换为对应 _thumb.webp
 *  3) thumbnailUrl 为 base64 内联的帖子：按 workId 取最新 AI 图缩略图替代，无则置 NULL
 *
 * 用法：node --env-file=.env scripts/backfill-ai-thumbs.mjs
 */
import OSS from 'ali-oss';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const CDN_BASE = (process.env.OSS_CDN_BASE ?? '').replace(/\/$/, '');
const oss = new OSS({
  region: process.env.OSS_REGION,
  bucket: process.env.OSS_BUCKET,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  endpoint: process.env.OSS_ENDPOINT || undefined,
  secure: true,
});
const CONCURRENCY = 4;

const thumbKeyOf = (key) => key.replace(/\.png$/i, '_thumb.webp');
const urlOf = (key) => (CDN_BASE ? `${CDN_BASE}/${key}` : null);

/** 从完整 URL 提取对象 key（兼容新旧域名） */
function keyOf(url) {
  const m = /^https?:\/\/[^/]+\/(.+)$/.exec(url ?? '');
  return m?.[1] ?? null;
}

async function makeThumb(buffer) {
  return sharp(buffer)
    .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

async function backfillOne(task) {
  const key = keyOf(task.resultUrl);
  const res = await fetch(task.resultUrl);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const thumb = await makeThumb(buffer);
  const tKey = thumbKeyOf(key);
  await oss.put(tKey, thumb, {
    mime: 'image/webp',
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  const thumbUrl = urlOf(tKey) ?? task.resultUrl; // 无 CDN 配置时保留原值不动
  if (!CDN_BASE) throw new Error('缺少 OSS_CDN_BASE，无法生成缩略图 URL');
  await prisma.aiTask.update({
    where: { id: task.id },
    data: { thumbUrl },
  });
}

async function main() {
  const tasks = await prisma.aiTask.findMany({
    where: {
      status: 'succeeded',
      thumbUrl: null,
      resultUrl: { contains: '/ai/', endsWith: '.png' },
    },
    select: { id: true, resultUrl: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`待回填任务: ${tasks.length}`);

  let done = 0;
  const failed = [];
  // 简单并发池
  const queue = [...tasks];
  async function worker() {
    for (;;) {
      const t = queue.shift();
      if (!t) return;
      try {
        await backfillOne(t);
        if (++done % 20 === 0) console.log(`进度 ${done}/${tasks.length}`);
      } catch (e) {
        failed.push(`${t.id}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`回填完成: 成功 ${done}，失败 ${failed.length}`);
  failed.forEach((f) => console.warn('  ✗', f));

  // 2) 快照刷新：thumbnailUrl 指向 ai/*.png → _thumb.webp（此刻缩略图已存在）
  const swap = (table) => `
    UPDATE "${table}"
    SET "thumbnailUrl" = regexp_replace("thumbnailUrl", '\\.png$', '_thumb.webp')
    WHERE "thumbnailUrl" ~ '^https?://[^/]+/ai/(image2|cutout)/[^/]+\\.png$'`;
  const plazaSwapped = await prisma.$executeRawUnsafe(swap('PlazaPost'));
  const workSwapped = await prisma.$executeRawUnsafe(swap('Work'));
  console.log(`快照刷新: PlazaPost ${plazaSwapped} 行，Work ${workSwapped} 行`);

  // 3) base64 内联缩略图的帖子：改用其作品最新 AI 图（优先缩略图），没有则置 NULL
  const base64Posts = await prisma.$queryRawUnsafe(
    `SELECT id, "workId" FROM "PlazaPost" WHERE "thumbnailUrl" LIKE 'data:%'`,
  );
  for (const post of base64Posts) {
    let url = null;
    if (post.workId) {
      const t = await prisma.aiTask.findFirst({
        where: { workId: post.workId, type: 'image2', status: 'succeeded' },
        orderBy: { createdAt: 'desc' },
        select: { resultUrl: true, thumbUrl: true },
      });
      url = t ? (t.thumbUrl ?? t.resultUrl) : null;
    }
    await prisma.plazaPost.update({
      where: { id: post.id },
      data: { thumbnailUrl: url },
    });
    console.log(`base64 帖子 ${post.id} -> ${url ?? 'NULL（无关联 AI 图）'}`);
  }
}

main()
  .catch((e) => {
    console.error('执行失败:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
