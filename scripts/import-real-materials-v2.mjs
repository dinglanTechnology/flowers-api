/**
 * 真花素材导入工具 v2：扫描 temp/20260724（第二批，含颜色变体）→ 生成数据源 →（可选）上传 OSS。
 *
 * 与 import-real-materials.mjs（第一批，保留可用）的差异：
 * - 支持颜色变体 <基名>-<形态>[-<茎长>][-<颜色>]（如 dahlia-full-pink、eustoma-full-pinkish white）
 * - 支持复合形态（百合花 single-full/half/bud）与字母款（curve-a/b）
 * - 花朵目录为 flat 结构 + 花朵/辅花 子组；主花级（FOCAL）排前且显示图取 full
 * - 文件归属纠正：花朵/玫瑰/penoy-* 实为牡丹（已看图确认，用户批准按牡丹导入）
 *
 * 默认 dry-run：重写 prisma/material-styles.generated.json 与
 * src/modules/materials/builtin-materials.data.ts，打印素材清单 / 上传计划 / 异常报告。
 * 加 --upload 才上传 OSS（原始字节直传，需 node --env-file=.env 注入 OSS_* 凭证）。
 *
 * 用法：
 *   node scripts/import-real-materials-v2.mjs            # 只生成数据源 + 打印报告
 *   node --env-file=.env scripts/import-real-materials-v2.mjs --upload
 *   node scripts/import-real-materials-v2.mjs --src=20260724   # 指定源目录（temp/ 下）
 *
 * OSS key 全部由规范化 slug 拼接（仅 [a-z0-9./-]），不沿用原文件名，
 * 从源头规避空格/特殊字符导致的 URL 访问问题（每个 key 都有正则硬校验）。
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_REL =
  process.argv.find((a) => a.startsWith('--src='))?.slice(6) ?? '20260724';
const SRC = join(ROOT, 'temp', SRC_REL);
const STYLES_JSON = join(ROOT, 'prisma', 'material-styles.generated.json');
const DATA_TS = join(ROOT, 'src', 'modules', 'materials', 'builtin-materials.data.ts');
const UPLOAD = process.argv.includes('--upload');

/* ---------------- 分组（花朵 flat + 辅花子组）与主花级 ---------------- */
const GROUPS = [
  { dir: '花朵', category: 'flower' },
  { dir: '花朵/辅花', category: 'flower' },
  { dir: '枝叶', category: 'greenery' },
  { dir: '线条', category: 'line' },
];

/** 主花级：显示图 full 优先 + 目录排序排前（第一批 13 种 + 本批新增焦点花） */
const FOCAL = new Set([
  '马蹄莲', '大丽花', '玉兰花', '牡丹', '莲花', '玫瑰', '洋桔梗',
  '向日葵', '栀子花', '山茶花', '木槿花', '非洲菊', '天竺葵',
  '百合花', '康乃馨', '菊花', '郁金香', '大花蕙兰', '格桑花',
]);

const SLUG_OVERRIDE = {
  '花朵/马蹄莲': 'calla',
  '花朵/海棠': 'crabapple',
  '花朵/绣线菊': 'spiraea',
  '花朵/玫瑰': 'rose', // 文件夹内混入 penoy-*，files[0] 不再是 rose 基座
  '花朵/牡丹': 'peony', // 同上，penoy-* 并入后 files[0] 可能是 penoy 基座
  '枝叶/高山牙齿': 'davallia-mariesii',
};
const NAME_OVERRIDE = {
  '枝叶/高山牙齿': '高山羊齿', // 文件夹原名漏字
};

/** 文件归属纠正：玫瑰文件夹里的 penoy-* 实为牡丹（已看图确认，用户批准） */
function fileOwner(folderRel, stem) {
  if (folderRel === '花朵/玫瑰' && stem.toLowerCase().startsWith('penoy-')) {
    return { key: '花朵/牡丹', name: '牡丹', slug: 'peony' };
  }
  return null;
}

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

/* ---------------- 变体语法：形态 [+ 茎长] [+ 颜色] ---------------- */
const FORMS = new Set([
  'full', 'half', 'bud', 'single', 'cluster', 'branch', 'bundle',
  'upright', 'curve', 'droop',
  'single-full', 'single-half', 'single-bud', // 百合花：单枝 + 花期
  'cluster-a', 'cluster-b', 'curve-a', 'curve-b',
]);
const FORM_ALIAS = { singl: 'single' }; // 源文件拼写容错
const FORM_CN = {
  full: '盛放', half: '半开', bud: '花苞', single: '单枝', cluster: '簇生',
  branch: '分枝', bundle: '束枝', upright: '直立', curve: '弯枝', droop: '垂枝',
  'single-full': '单枝盛放', 'single-half': '单枝半开', 'single-bud': '单枝花苞',
  'cluster-a': '簇生A', 'cluster-b': '簇生B', 'curve-a': '弯枝A', 'curve-b': '弯枝B',
};
const LENGTHS = { long: '长茎', mid: '中茎', short: '短茎' };
const COLORS = {
  white: '白', pink: '粉', red: '红', yellow: '黄', purple: '紫',
  orange: '橙', blue: '蓝', green: '绿', 'pinkish-white': '粉白',
};

/** 显示图优先级：主花级 full 优先；其余 single 优先 */
const PRIORITY_MAIN = [
  'full', 'half', 'bud', 'single-full', 'single-half', 'single-bud',
  'curve', 'droop',
];
const PRIORITY_DEFAULT = [
  'single', 'upright', 'full', 'branch', 'bundle', 'curve',
  'single-full', 'half', 'cluster', 'droop', 'bud',
  'single-half', 'single-bud', 'cluster-a', 'cluster-b', 'curve-a', 'curve-b',
];
const LENGTH_RANK = { mid: 1, long: 2, short: 3 }; // 无茎长=0（标准款排最前）

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const KEY_RE = /^[a-z0-9][a-z0-9./-]*$/;
function assertKey(key) {
  if (!KEY_RE.test(key)) throw new Error(`非法 OSS key（含特殊字符）: ${key}`);
  return key;
}

/** 解析变体：'<形态>' | '<形态>-<茎长>' | '<形态>-<颜色>' | '<形态>-<茎长>-<颜色>'；无法识别返回 null */
function parseVariant(stemRaw) {
  const parts = stemRaw.replace(/[\s_]+/g, '-').split('-'); // 空格/下划线归一
  let color;
  // 双色词优先（pinkish-white），再单词色
  if (parts.length > 2 && COLORS[parts.slice(-2).join('-').toLowerCase()]) {
    color = parts.splice(-2).join('-').toLowerCase();
  } else if (parts.length > 1 && COLORS[parts.at(-1).toLowerCase()]) {
    color = parts.pop().toLowerCase();
  }
  let len;
  if (parts.length > 1 && LENGTHS[parts.at(-1).toLowerCase()]) {
    len = parts.pop().toLowerCase();
  }
  const norm = (t) => FORM_ALIAS[t.toLowerCase()] ?? t.toLowerCase();
  let form;
  if (parts.length > 1) {
    const two = `${norm(parts.at(-2))}-${norm(parts.at(-1))}`;
    if (FORMS.has(two)) {
      form = two;
      parts.splice(-2);
    }
  }
  if (!form) {
    const one = norm(parts.at(-1) ?? '');
    if (FORMS.has(one)) {
      form = one;
      parts.pop();
    }
  }
  if (!form) return null;
  return { variant: [form, len, color].filter(Boolean).join('-'), form, len, color };
}

/** 变体 → 中文样式名：盛放（红）/ 弯枝（长茎）/ 单枝半开（黄） */
function cnOf(variant) {
  const { form, len, color } = parseVariant(`x-${variant}`);
  return (
    (form ? FORM_CN[form] : variant) +
    (len ? `（${LENGTHS[len]}）` : '') +
    (color ? `（${COLORS[color]}）` : '')
  );
}

/** 排序键：[形态优先级, 茎长, 无颜色优先, 颜色名, 变体名] */
function rankOf(variant, priority) {
  const { form, len, color } = parseVariant(`x-${variant}`);
  const fi = form ? priority.indexOf(form) : -1;
  return [
    fi === -1 ? 99 : fi,
    len ? LENGTH_RANK[len] : 0,
    color ? 1 : 0,
    color ?? '',
    variant,
  ];
}
const cmpRank = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
};

/* ---------------- 扫描：按「归属素材」聚合文件 ---------------- */
const anomalies = [];
/** owner key → { name, category, slug?, files: [{src, stem}] } */
const owners = new Map();
const seenNames = new Set();

for (const g of GROUPS) {
  const groupDir = join(SRC, g.dir);
  const folders = (await readdir(groupDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));

  for (const folder of folders) {
    const rel = `${g.dir}/${folder}`;
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

    for (const f of files) {
      const stem = f.slice(0, -4);
      const override = fileOwner(rel, stem);
      const key = override?.key ?? rel;
      if (!owners.has(key)) {
        owners.set(key, {
          name: NAME_OVERRIDE[key] ?? override?.name ?? cleanName,
          category: g.category,
          slug: override?.slug ?? SLUG_OVERRIDE[key],
          files: [],
        });
      }
      owners.get(key).files.push({ src: join(groupDir, folder, f), stem });
    }
  }
}

/** 从文件名基座提取 slug 基名：规范化后去掉完整变体后缀（含颜色/茎长） */
function baseOf(stem) {
  const norm = stem.replace(/[\s_]+/g, '-');
  const parsed = parseVariant(norm);
  return parsed ? norm.slice(0, norm.length - parsed.variant.length - 1) : norm;
}

/* ---------------- 构建素材清单 ---------------- */
const materials = [];
for (const [key, owner] of owners) {
  const priority = FOCAL.has(owner.name) ? PRIORITY_MAIN : PRIORITY_DEFAULT;
  const seenVariants = new Set();
  const variants = [];
  for (const f of owner.files.sort((a, b) => a.stem.localeCompare(b.stem))) {
    const parsed = parseVariant(f.stem);
    if (!parsed) {
      anomalies.push(`无法识别变体，跳过文件: ${key}/${f.stem}.png`);
      continue;
    }
    if (seenVariants.has(parsed.variant)) {
      anomalies.push(`变体重复（取首张）: ${key}/${f.stem}.png → ${parsed.variant}`);
      continue;
    }
    seenVariants.add(parsed.variant);
    variants.push({ variant: parsed.variant, src: f.src });
  }
  if (!variants.length) continue;
  variants.sort((a, b) => cmpRank(rankOf(a.variant, priority), rankOf(b.variant, priority)));

  const slug = owner.slug ?? slugify(baseOf(owner.files[0].stem));
  materials.push({
    id: `mat-${slug}`,
    name: owner.name,
    category: owner.category,
    kind: slug,
    styles: variants.map((v) => ({
      styleOption: `${slug}-${v.variant}`,
      name: `${owner.name}${cnOf(v.variant)}`,
      variant: v.variant,
      src: v.src,
    })),
  });
}

/* ---------------- 花器（单文件即素材，单样式） ---------------- */
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

/* ---------------- 目录排序：分类 → 主花级优先 → 中文名 ---------------- */
const CAT_RANK = { flower: 0, greenery: 1, line: 2, vase: 3 };
materials.sort(
  (a, b) =>
    CAT_RANK[a.category] - CAT_RANK[b.category] ||
    Number(!FOCAL.has(a.name)) - Number(!FOCAL.has(b.name)) ||
    a.name.localeCompare(b.name, 'zh-Hans-CN'),
);

const ids = new Set();
for (const m of materials) {
  if (ids.has(m.id)) throw new Error(`素材 id 重复: ${m.id}`);
  ids.add(m.id);
}

const CDN = (process.env.OSS_CDN_BASE ?? 'https://flower-prod.zhilingtech.com').replace(/\/$/, '');
const thumbKey = (m) => assertKey(`default-materials/${m.category}/${m.id}.png`);
const styleKey = (m, s) => assertKey(`default-materials/${m.category}/${m.id}/${s.styleOption}.png`);

console.log(`源目录: temp/${SRC_REL}`);
console.log(`素材总数: ${materials.length}`);
const byCat = {};
for (const m of materials) byCat[m.category] = (byCat[m.category] ?? 0) + 1;
console.log('分类统计:', byCat, '\n');

const uploadPlan = [];
for (const m of materials) {
  if (m.styles) {
    console.log(`${m.id}  ${m.name}（${m.category}）显示图=${m.styles[0].variant}  共${m.styles.length}款`);
    for (const s of m.styles) {
      console.log(`   - ${s.styleOption}  ${s.name}`);
      uploadPlan.push({ src: s.src, key: styleKey(m, s) });
    }
    uploadPlan.push({ src: m.styles[0].src, key: thumbKey(m) }); // 目录展示图=首选样式副本
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

/** 内置素材元数据。本文件由 scripts/import-real-materials-v2.mjs 生成，勿手工编辑；
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
      const buf = await readFile(item.src); // 原始字节直传；日后压缩版同名覆盖同 key 即可
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

  for (const item of uploadPlan.slice(0, 3)) {
    const res = await fetch(`${CDN}/${item.key}`, { method: 'HEAD' });
    console.log(`抽查 ${res.status} ${CDN}/${item.key}`);
  }
} else {
  console.log('\n（dry-run：未上传 OSS。确认无误后执行: node --env-file=.env scripts/import-real-materials-v2.mjs --upload）');
}
