/**
 * 把内置素材导入 Material 表，imageUrl 指向已上传 OSS 的透明底 PNG。
 *
 * 素材元数据仍以代码里的 BUILTIN_MATERIALS 为唯一事实源；本脚本只做「元数据 + OSS 地址」落库。
 * 幂等：按素材 id upsert，可反复重跑（改了元数据/换了图重跑即可，不会产生重复）。
 *
 * 地址约定（与上传 OSS 的 key 一致）：
 *   <BASE>/<category>/<id>.png
 *   例如 https://flower-prod.oss-cn-chengdu.aliyuncs.com/default-materials/flower/mat-anemone.png
 *
 * BASE 解析优先级：
 *   1. MATERIALS_ASSET_BASE_URL（显式覆盖，最高优先）
 *   2. OSS_CDN_BASE + '/default-materials'（走了 CDN 时）
 *   3. https://<OSS_BUCKET>.<OSS_REGION>.aliyuncs.com/default-materials（默认 OSS 域名）
 *
 * 一般无需额外配置：.env 里已有 OSS_BUCKET / OSS_REGION，直接 pnpm materials:seed 即可。
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { BUILTIN_MATERIALS } from '../src/modules/materials/builtin-materials.data';

const prisma = new PrismaClient();

/** OSS 上默认素材的一级前缀（与上传目录一致） */
const ASSET_PREFIX = 'default-materials';

interface MaterialStyle {
  styleOption: string;
  name: string;
  morph: string;
  lengthScale: number;
  colors: string[];
}

/**
 * 每个素材的多样式预设，由 scripts/extract-material-styles.mjs 从原型提取。
 * 只有默认花/枝/线素材有条目（38 个 × 6 款）；花器与自定义素材没有 → 单样式。
 */
const MATERIAL_STYLES = JSON.parse(
  readFileSync(join(__dirname, 'material-styles.generated.json'), 'utf-8'),
) as Record<string, MaterialStyle[]>;

function resolveBaseUrl(): string {
  const explicit = process.env.MATERIALS_ASSET_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');

  const cdn = process.env.OSS_CDN_BASE?.trim();
  if (cdn) return `${cdn.replace(/\/+$/, '')}/${ASSET_PREFIX}`;

  const bucket = process.env.OSS_BUCKET?.trim();
  const region = process.env.OSS_REGION?.trim();
  if (bucket && region) {
    return `https://${bucket}.${region}.aliyuncs.com/${ASSET_PREFIX}`;
  }

  throw new Error(
    '未能确定素材地址前缀：请设置 MATERIALS_ASSET_BASE_URL，或确保 .env 里有 OSS_BUCKET + OSS_REGION。\n' +
      '例如 MATERIALS_ASSET_BASE_URL=https://flower-prod.oss-cn-chengdu.aliyuncs.com/default-materials',
  );
}

async function main() {
  const base = resolveBaseUrl();
  console.log(`素材地址前缀: ${base}`);
  console.log(`待导入: ${BUILTIN_MATERIALS.length} 个素材\n`);

  let ok = 0;
  let withStyles = 0;
  for (const [i, m] of BUILTIN_MATERIALS.entries()) {
    // 缩略图（选择器/目录用）：<base>/<category>/<id>.png
    const imageUrl = `${base}/${m.category}/${m.id}.png`;

    // 前端纯贴图，样式只需 {styleOption, name, imageUrl}；morph/lengthScale/colors 是生成侧用的，不下发
    const rawStyles = MATERIAL_STYLES[m.id]; // 花器/无样式素材为 undefined
    const styles = rawStyles?.map((s) => ({
      styleOption: s.styleOption,
      name: s.name,
      imageUrl: `${base}/${m.category}/${m.id}/${s.styleOption}.png`,
    }));
    if (styles) withStyles += 1;

    const data = {
      name: m.name,
      category: m.category,
      kind: m.kind,
      colors: m.colors,
      shape: m.shape ?? null,
      imageUrl,
      // 单样式素材写 NULL；数组需转成 Prisma.InputJsonValue（强类型对象数组不满足其索引签名）
      styles: styles
        ? (styles as unknown as Prisma.InputJsonValue)
        : Prisma.DbNull,
      sortOrder: i, // 按数组顺序即目录展示顺序
      active: true,
    };
    await prisma.material.upsert({
      where: { id: m.id },
      update: data,
      create: { id: m.id, ...data },
    });
    ok += 1;
  }

  const total = await prisma.material.count();
  console.log(
    `✅ upsert 完成 ${ok} 个（其中 ${withStyles} 个带多样式）；Material 表当前共 ${total} 行`,
  );
}

main()
  .catch((err) => {
    console.error('导入失败:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
