/**
 * 一次性数据迁移：把数据库里存量的 OSS 默认域名 URL 替换为自定义域名。
 * 对象本身不用动——同一对象两个域名都能访问，这里只改 DB 里存的 URL 前缀。
 *
 * 用法（PrismaClient 不自动读 .env，用 node 原生 --env-file 注入）：
 *   node --env-file=.env scripts/replace-oss-domain.mjs
 * 生产环境同理，在服务器上以生产的 .env 执行一次。
 */
import { PrismaClient } from '@prisma/client';

const OLD = 'https://flower-prod.oss-cn-chengdu.aliyuncs.com';
const NEW = 'https://flower-prod.zhilingtech.com';

/** [表, 列, 是否 JSON 列]——JSON 列里内嵌了素材图 URL（arrangement 快照 / styles 预设） */
const TARGETS = [
  ['User', 'avatarUrl', false],
  ['Work', 'thumbnailUrl', false],
  ['Work', 'arrangement', true],
  ['PlazaPost', 'thumbnailUrl', false],
  ['PlazaPost', 'arrangement', true],
  ['Material', 'imageUrl', false],
  ['Material', 'styles', true],
  ['CustomMaterial', 'imageUrl', false],
  ['CustomMaterial', 'sourceImageUrl', false],
  ['AiTask', 'inputImageUrl', false],
  ['AiTask', 'resultUrl', false],
  ['AiTask', 'thumbUrl', false],
];

const prisma = new PrismaClient();

const countSql = (table, col) =>
  `SELECT count(*)::int AS c FROM "${table}" WHERE "${col}"::text LIKE '%' || $1 || '%'`;
const updateSql = (table, col, isJson) =>
  `UPDATE "${table}" SET "${col}" = replace("${col}"::text, $1, $2)${isJson ? '::jsonb' : ''} WHERE "${col}"::text LIKE '%' || $1 || '%'`;

async function main() {
  console.log(`替换 ${OLD}\n  -> ${NEW}\n`);

  const before = new Map();
  for (const [table, col] of TARGETS) {
    const [{ c }] = await prisma.$queryRawUnsafe(countSql(table, col), OLD);
    before.set(`${table}.${col}`, c);
  }
  const totalBefore = [...before.values()].reduce((a, b) => a + b, 0);
  console.log('命中行数（替换前）:', Object.fromEntries(before));
  if (totalBefore === 0) {
    console.log('\n没有需要替换的数据，退出。');
    return;
  }

  // 单事务执行全部替换；任何一步失败整体回滚
  const results = await prisma.$transaction(
    TARGETS.map(([table, col, isJson]) =>
      prisma.$executeRawUnsafe(updateSql(table, col, isJson), OLD, NEW),
    ),
  );
  const updated = Object.fromEntries(
    TARGETS.map(([table, col], i) => [`${table}.${col}`, results[i]]),
  );
  console.log('\n实际更新行数:', updated);

  // 验证：旧域名应一处不剩
  let remaining = 0;
  for (const [table, col] of TARGETS) {
    const [{ c }] = await prisma.$queryRawUnsafe(countSql(table, col), OLD);
    if (c > 0) console.warn(`⚠ ${table}.${col} 仍剩 ${c} 行含旧域名`);
    remaining += c;
  }
  console.log(remaining === 0 ? '\n✅ 完成，旧域名已清零。' : `\n❌ 仍有 ${remaining} 处残留，请检查。`);
}

main()
  .catch((e) => {
    console.error('执行失败（事务已回滚）:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
