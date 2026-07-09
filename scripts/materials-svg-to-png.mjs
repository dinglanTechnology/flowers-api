/**
 * 把 docs/index.html 里程序化生成的素材 SVG 逐个栅格化为透明 PNG。
 *
 * 原理：素材是运行时由页面内 svgFor() 按 kind + colors 画出的纯 SVG 字符串，
 * 不依赖任何浏览器专有 API。这里用 puppeteer-core 驱动本机已装的 Chrome 加载页面，
 * 在页面上下文里对每个 material 调 svgFor() 拿到 SVG，再用 canvas 栅格化成透明 PNG。
 *
 * 用法：
 *   node scripts/materials-svg-to-png.mjs
 *   SIZE=512 node scripts/materials-svg-to-png.mjs      # 自定义最大边像素
 *   CHROME="/path/to/Chrome" node scripts/materials-svg-to-png.mjs
 *
 * 输出：materials-png/<category>/<materialId>.png
 *   按分类分子文件夹（flower / greenery / line / vase），文件名即素材 id，便于按 id 传 OSS
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = join(ROOT, 'docs', 'index.html');
const OUT_DIR = join(ROOT, 'materials-png');

const SIZE = Number(process.env.SIZE || 1024); // 最大边像素，保持宽高比
const CHROME =
  process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
  });

  try {
    const page = await browser.newPage();
    await page.goto('file://' + HTML, { waitUntil: 'networkidle0' });

    // 在页面上下文里：对每个素材/姿态调 svgFor()，用 canvas 转透明 PNG，返回 dataURL
    const results = await page.evaluate(async (size) => {
      // 解析 viewBox 取宽高比，避免非正方形素材被拉伸
      function viewBox(svg) {
        const m = /viewBox="([^"]+)"/.exec(svg);
        if (!m) return { w: 1, h: 1 };
        const [, , w, h] = m[1].trim().split(/\s+/).map(Number);
        return { w: w || 1, h: h || 1 };
      }

      // lengthScale：把 svgFor 结果纵向拉伸（等价于选择器的 scaleY），烘进图里
      function rasterize(svgString, maxSide, lengthScale = 100) {
        return new Promise((resolve, reject) => {
          const { w, h } = viewBox(svgString);
          const scale = maxSide / Math.max(w, h);
          const cw = Math.round(w * scale);
          const ch = Math.round(h * scale * (lengthScale / 100));

          // 作为 <img> 资源加载时 SVG 按严格 XML 解析，必须带 xmlns；
          // 同时补上显式宽高，drawImage 才会按此尺寸绘制
          const sized = svgString.replace(
            /<svg /,
            `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cw}" height="${ch}" `,
          );
          const url =
            'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);

          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, cw, ch); // 透明底
            ctx.drawImage(img, 0, 0, cw, ch); // 拉伸到 ch = 烘进 lengthScale
            resolve(canvas.toDataURL('image/png'));
          };
          img.onerror = () => reject(new Error('svg 载入失败'));
          img.src = url;
        });
      }

      // materials / svgFor / styleOptionsFor 均为页面顶层声明，裸名引用
      const out = [];
      for (const material of materials) {
        // 每个素材都出一张“默认缩略图”（目录/选择器用），路径 <category>/<id>.png
        out.push({
          path: `${material.category}/${material.id}.png`,
          category: material.category,
          kind: 'thumb',
          dataUrl: await rasterize(svgFor(material), size),
        });

        if (material.category === 'vase') continue; // 花器无多样式

        // 每款姿态一张，烘进各自 lengthScale，路径 <category>/<id>/<styleOption>.png
        const opts = styleOptionsFor({}, material);
        for (const o of opts) {
          // styleOptionsFor 返回的字段是 o.id（= styleOption），与提取脚本/DB 对齐
          const svg = svgFor(material, false, o.colors, o); // 该 morph + 该配色
          out.push({
            path: `${material.category}/${material.id}/${o.id}.png`,
            category: material.category,
            kind: 'style',
            dataUrl: await rasterize(svg, size, o.lengthScale),
          });
        }
      }
      return out;
    }, SIZE);

    // 按 path 建目录并写文件
    const madeDirs = new Set();
    for (const { path, dataUrl } of results) {
      const dir = join(OUT_DIR, dirname(path));
      if (!madeDirs.has(dir)) {
        await mkdir(dir, { recursive: true });
        madeDirs.add(dir);
      }
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      await writeFile(join(OUT_DIR, path), Buffer.from(base64, 'base64'));
    }

    console.log(`✅ 导出 ${results.length} 个 PNG（${SIZE}px 最大边）到 ${OUT_DIR}`);
    const byKind = results.reduce((acc, r) => {
      acc[r.kind] = (acc[r.kind] || 0) + 1;
      return acc;
    }, {});
    console.log('   缩略图 vs 姿态:', byKind);
    const byCat = results.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] || 0) + 1;
      return acc;
    }, {});
    console.log('   分类子目录:', byCat);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('导出失败:', err);
  process.exit(1);
});
