import sharp from 'sharp';

/** 缩略图最长边（列表/封面场景，兼顾 2x 屏） */
export const THUMB_MAX_SIDE = 480;

/**
 * 生成缩略图：最长边缩到 480（小图不放大），转 webp q80（保留透明通道）。
 * 失败（坏图/格式不支持）返回 null，由调用方决定降级，不影响主流程。
 */
export async function makeThumbnail(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(buffer)
      .resize(THUMB_MAX_SIDE, THUMB_MAX_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * 由 AI 原图 URL 派生缩略图 URL。命名约定：
 * ai/(image2|cutout)/<taskId>.png → ai/<type>/<taskId>_thumb.webp（上传原图时必然已生成）。
 * 非 AI 图（创作台快照、直传图）返回 undefined，调用方回退原图字段。
 */
export function aiThumbOf(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /\/ai\/(?:image2|cutout)\/[^/]+\.png$/.test(url)
    ? url.replace(/\.png$/, '_thumb.webp')
    : undefined;
}
