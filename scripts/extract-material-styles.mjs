/**
 * 从 docs/index.html 提取每个默认素材的多样式信息（6 款预设），产出 JSON 供 seed 使用。
 *
 * 关键：直接复用页面自身的 styleOptionsFor()（含 morph / lengthScale / 配色解析），
 * 不手写重实现，保证导出的 6 款与原型显示的逐项一致（兰花/枯枝的专属 morph 也正确）。
 * 花器（vase）无多样式，跳过。
 *
 * 用法：node scripts/extract-material-styles.mjs
 * 产出：prisma/material-styles.generated.json  形如 { "mat-rose": [ {styleOption,name,morph,lengthScale,colors}, … ] }
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = join(ROOT, 'docs', 'index.html');
const OUT = join(ROOT, 'prisma', 'material-styles.generated.json');
const CHROME =
  process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.goto('file://' + HTML, { waitUntil: 'networkidle0' });

    const styles = await page.evaluate(() => {
      const out = {};
      // materials / styleOptionsFor 都是页面顶层声明，可裸名引用
      for (const m of materials) {
        if (m.category === 'vase') continue; // 花器无多样式
        // styleOptionsFor(item, material)：item 仅需真值占位；返回已解析颜色的 6 款
        const opts = styleOptionsFor({}, m);
        out[m.id] = opts.map((o) => ({
          styleOption: o.id,
          name: o.name,
          morph: o.morph,
          lengthScale: o.lengthScale,
          colors: o.colors, // 已解析成实际色值数组（original 即素材自身 colors）
        }));
      }
      return out;
    });

    const ids = Object.keys(styles);
    const counts = ids.reduce((acc, id) => {
      const n = styles[id].length;
      acc[n] = (acc[n] || 0) + 1;
      return acc;
    }, {});
    await writeFile(OUT, JSON.stringify(styles, null, 2) + '\n');
    console.log(`✅ 提取 ${ids.length} 个素材的样式 → ${OUT}`);
    console.log('   每素材款数分布:', counts); // 期望 { "6": 38 }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('提取失败:', err);
  process.exit(1);
});
