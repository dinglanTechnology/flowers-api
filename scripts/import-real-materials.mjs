/**
 * 真花素材导入工具（一次性）：扫描 temp/插花素材 → 生成数据源 → （可选）上传 OSS。
 *
 * 默认 dry-run：重写 prisma/material-styles.generated.json 与
 * src/modules/materials/builtin-materials.data.ts，打印素材清单 / 上传计划 / 异常报告。
 * 加 --upload 才会上传 OSS（需 node --env-file=.env 注入 OSS_* 凭证）。
 * 当前按原始字节直传（未压缩）；日后同名压缩版直接覆盖同 key 即可，URL/DB 无需变动。
 *
 * 用法：
 *   node scripts/import-real-materials.mjs            # 只生成数据源 + 打印报告
 *   node --env-file=.env scripts/import-real-materials.mjs --upload
 *
 * OSS key 全部由规范化 slug 拼接（仅 [a-z0-9./-]），不沿用原文件名，
 * 从源头规避空格/特殊字符导致的 URL 访问问题（每个 key 都有正则硬校验）。
 */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'temp', '插花素材');
const STYLES_JSON = join(ROOT, 'prisma', 'material-styles.generated.json');
const DATA_TS = join(ROOT, 'src', 'modules', 'materials', 'builtin-materials.data.ts');
const UPLOAD = process.argv.includes('--upload');

/* ---------------- 分类与分组（数组顺序即目录展示顺序） ---------------- */
const GROUPS = [
  { dir: '花朵/主花', category: 'flower', main: true },
  { dir: '花朵/辅花', category: 'flower', main: false },
  { dir: '花朵/点缀花', category: 'flower', main: false },
  { dir: '枝叶', category: 'greenery', main: false },
  { dir: '线条', category: 'line', main: false },
];

/** 文件夹（相对路径）→ slug 覆盖；缺省用文件名基座 slug 化 */
const SLUG_OVERRIDE = {
  '花朵/主花/马蹄莲': 'calla',
  '花朵/辅花/海棠': 'crabapple',
  '花朵/点缀花/绣线菊': 'spiraea',
};

/** 花器（单文件即素材）：文件基座 slug → 中文名 */
const VASE_NAMES = {
  'vase-round-ceramic-white': '白瓷圆瓶',
  'vase-tall-recycled-glass-green': '绿色高玻璃瓶',
  'vase-ruffle-glass-pink': '粉色褶边玻璃瓶',
  'vase-small-round-ceramic-black': '黑瓷小圆瓶',
  'vase-terracotta-medium-ceramic-tan': '陶土色中陶罐',
  'vase-large-stoneware-warm-brown': '暖棕大号石陶瓶',
  'vase-ruffle-ceramic-white': '白瓷褶边瓶',
  'vase-pitcher-stoneware-black': '黑色石陶水壶瓶',
};

/* ---------------- 变体规则（形态 + 可选茎长，见 temp/素材准备需求-v2.md） ---------------- */
const FORMS = new Set([
  'full', 'half', 'bud', 'single', 'cluster', 'branch', 'bundle',
  'upright', 'curve', 'droop', 'cluster-a', 'cluster-b',
]);
const LENGTHS = { long: '长茎', mid: '中茎', short: '短茎' };
const FORM_CN = {
  full: '盛放', half: '半开', bud: '花苞', single: '单枝', cluster: '簇生',
  branch: '分枝', bundle: '束枝', upright: '直立', curve: '弯枝', droop: '垂枝',
  'cluster-a': '簇生A', 'cluster-b': '簇生B',
};
/** 显示图优先级：主花 full 优先；其余 single 优先（与需求一致） */
const PRIORITY_MAIN = ['full', 'half', 'bud', 'curve', 'droop'];
const PRIORITY_DEFAULT = [
  'single', 'upright', 'full', 'branch', 'bundle', 'curve',
  'half', 'cluster', 'droop', 'bud', 'cluster-a', 'cluster-b',
];

/** 'curve-long' → ['curve','long']；'cluster-a' → ['cluster-a', undefined] */
function splitVariant(variant) {
  const parts = variant.split('-');
  const last = parts.at(-1);
  return LENGTHS[last]
    ? [parts.slice(0, -1).join('-'), last]
    : [variant, undefined];
}
const cnOf = (variant) => {
  const [form, len] = splitVariant(variant);
  return FORM_CN[form] + (len ? `（${LENGTHS[len]}）` : '');
};
const LENGTH_RANK = { mid: 1, long: 2, short: 3 }; // 无茎长=0（标准款排最前）

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const KEY_RE = /^[a-z0-9][a-z0-9./-]*$/;
function assertKey(key) {
  if (!KEY_RE.test(key)) throw new Error(`非法 OSS key（含特殊字符）: ${key}`);
  return key;
}

/** 从文件名（去 .png）解析变体：'-<形态>' 或 '-<形态>-<茎长>'；无法识别返回 null */
function parseVariant(stem) {
  const m = /-([a-z]+(?:-[ab])?)(?:-(long|mid|short))?$/i.exec(stem);
  if (!m) return null;
  const form = m[1].toLowerCase();
  if (!FORMS.has(form)) return null;
  return m[2] ? `${form}-${m[2].toLowerCase()}` : form;
}

const anomalies = [];
const materials = []; // { id, name, category, kind, styles: [{styleOption,name,variant,src}] , vaseSrc? }

/* ---------------- 扫描花朵/枝叶/线条（每文件夹一素材） ---------------- */
const seenNames = new Set();
for (const g of GROUPS) {
  const groupDir = join(SRC, g.dir);
  const folders = (await readdir(groupDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  for (const folder of folders) {
    const rel = `${g.dir}/${folder}`;
    // 「海桐(1)」这类重复目录：去掉尾缀 (N) 后按已见跳过
    const cleanName = folder.replace(/\(\d+\)$/, '');
    if (seenNames.has(`${g.category}:${cleanName}`)) {
      anomalies.push(`跳过重复目录: ${rel}`);
      continue;
    }
    seenNames.add(`${g.category}:${cleanName}`);

    const files = (await readdir(join(groupDir, folder)))
      .filter((f) => f.toLowerCase().endsWith('.png'))
      .sort();
    if (!files.length) {
      anomalies.push(`空目录跳过: ${rel}`);
      continue;
    }

    const variants = [];
    for (const f of files) {
      const stem = f.slice(0, -4);
      const v = parseVariant(stem);
      if (!v) {
        anomalies.push(`无法识别变体，跳过文件: ${rel}/${f}`);
        continue;
      }
      variants.push({ variant: v, src: join(groupDir, folder, f) });
    }
    if (!variants.length) continue;

    const base = slugify(files[0].slice(0, -4).replace(/-[a-z]+(?:-[ab])?(?:-(?:long|mid|short))?$/i, ''));
    const slug = SLUG_OVERRIDE[rel] ?? base;
    const id = `mat-${slug}`;
    const priority = g.main ? PRIORITY_MAIN : PRIORITY_DEFAULT;
    const rank = (v) => {
      const [form, len] = splitVariant(v);
      const fi = priority.indexOf(form);
      return [(fi === -1 ? 99 : fi), len ? LENGTH_RANK[len] : 0];
    };
    variants.sort((a, b) => {
      const [fa, la] = rank(a.variant);
      const [fb, lb] = rank(b.variant);
      return fa - fb || la - lb || a.variant.localeCompare(b.variant);
    });

    materials.push({
      id,
      name: cleanName,
      category: g.category,
      kind: slug,
      styles: variants.map((v) => ({
        styleOption: `${slug}-${v.variant}`,
        name: `${cleanName}${cnOf(v.variant)}`,
        variant: v.variant,
        src: v.src,
      })),
    });
  }
}

/* ---------------- 扫描花器（每文件一素材，单样式） ---------------- */
const vaseDir = join(SRC, '花器');
const vaseFiles = (await readdir(vaseDir))
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();
for (const f of vaseFiles) {
  const slug = slugify(f.slice(0, -4));
  const name = VASE_NAMES[slug];
  if (!name) anomalies.push(`花器缺少中文名映射: ${f}（暂用 slug）`);
  materials.push({
    id: `mat-${slug}`,
    name: name ?? slug,
    category: 'vase',
    kind: slug,
    styles: null,
    vaseSrc: join(vaseDir, f),
  });
}

/* ---------------- 汇总与校验 ---------------- */
const ids = new Set();
for (const m of materials) {
  if (ids.has(m.id)) throw new Error(`素材 id 重复: ${m.id}`);
  ids.add(m.id);
}

const CDN = (process.env.OSS_CDN_BASE ?? 'https://flower-prod.zhilingtech.com').replace(/\/$/, '');
const thumbKey = (m) => assertKey(`default-materials/${m.category}/${m.id}.png`);
const styleKey = (m, s) => assertKey(`default-materials/${m.category}/${m.id}/${s.styleOption}.png`);

console.log(`素材总数: ${materials.length}`);
const byCat = {};
for (const m of materials) byCat[m.category] = (byCat[m.category] ?? 0) + 1;
console.log('分类统计:', byCat, '\n');

const uploadPlan = []; // { src, key }
for (const m of materials) {
  if (m.styles) {
    console.log(`${m.id}  ${m.name}（${m.category}）显示图=${m.styles[0].variant}`);
    for (const s of m.styles) {
      console.log(`   - ${s.styleOption}  ${s.name}`);
      uploadPlan.push({ src: s.src, key: styleKey(m, s) });
    }
    // 目录展示图 = 首个样式（显示变体）的副本
    uploadPlan.push({ src: m.styles[0].src, key: thumbKey(m) });
  } else {
    console.log(`${m.id}  ${m.name}（vase，单样式）`);
    uploadPlan.push({ src: m.vaseSrc, key: thumbKey(m) });
  }
}
console.log(`\n上传对象数: ${uploadPlan.length}`);
if (anomalies.length) {
  console.log('\n异常/提示:');
  anomalies.forEach((a) => console.log('  !', a));
}

/* ---------------- 写数据源（generated.json + data.ts） ---------------- */
const stylesJson = {};
for (const m of materials) {
  if (!m.styles) continue;
  stylesJson[m.id] = m.styles.map((s) => ({
    styleOption: s.styleOption,
    name: s.name,
    morph: 'photo',
    lengthScale: 1,
    colors: [],
  }));
}
await writeFile(STYLES_JSON, JSON.stringify(stylesJson, null, 2) + '\n');

const entries = materials
  .map(
    (m) =>
      `  {\n    id: '${m.id}',\n    name: '${m.name}',\n    category: '${m.category}',\n    kind: '${m.kind}',\n    colors: [],\n  },`,
  )
  .join('\n');
const dataTs = `export interface BuiltinMaterial {
  id: string;
  name: string;
  category: 'flower' | 'greenery' | 'line' | 'vase';
  kind: string;
  colors: string[];
  shape?: string;
  previewUrl?: string;
  minAppVersion?: string;
}

export const MATERIAL_CATEGORIES = [
  { id: 'flower', label: '花朵' },
  { id: 'greenery', label: '枝叶' },
  { id: 'line', label: '线条' },
  { id: 'vase', label: '花器' },
];

/** 内置素材元数据。本文件由 scripts/import-real-materials.mjs 生成，勿手工编辑；
 *  真花照片素材（透明底 PNG 存 OSS），kind/colors 为矢量时代遗留字段，接口不下发。 */
export const BUILTIN_MATERIALS: BuiltinMaterial[] = [
${entries}
];
`;
await writeFile(DATA_TS, dataTs);
console.log(`\n已写入: ${STYLES_JSON}`);
console.log(`已写入: ${DATA_TS}`);

/* ---------------- 可选：上传 OSS ---------------- */
if (UPLOAD) {
  const { default: OSS } = await import('ali-oss');
  const oss = new OSS({
    region: process.env.OSS_REGION,
    bucket: process.env.OSS_BUCKET,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    endpoint: process.env.OSS_ENDPOINT || undefined,
    secure: true,
  });
  let done = 0;
  const queue = [...uploadPlan];
  const worker = async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      // 原始字节直传（不压缩）；日后压缩版同名覆盖同 key 即可
      const buf = await readFile(item.src);
      await oss.put(item.key, buf, {
        mime: 'image/png',
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
      if (++done % 20 === 0 || done === uploadPlan.length) {
        console.log(`上传进度 ${done}/${uploadPlan.length}`);
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  // 抽查 3 个 URL
  for (const item of uploadPlan.slice(0, 3)) {
    const res = await fetch(`${CDN}/${item.key}`, { method: 'HEAD' });
    console.log(`抽查 ${res.status} ${CDN}/${item.key}`);
  }
} else {
  console.log('\n（dry-run：未上传 OSS。确认无误后执行: node --env-file=.env scripts/import-real-materials.mjs --upload）');
}
