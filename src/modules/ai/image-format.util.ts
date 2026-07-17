/**
 * 上游图像模型友好格式校验。
 *
 * atlas（youchuan 去背 / gpt-image-2 edit）与 tokenlab（gpt-image-2）都只对常见位图友好：
 * PNG / JPEG / WEBP。iPhone 默认的 HEIC/HEIF、动图 GIF、BMP/TIFF、矢量 SVG、AVIF 等
 * 大概率被上游拒绝或直接回笼统错误（“Origin service encountered an error” / 连接被掐）。
 * 提前拦掉并给出可读提示，避免白跑一趟队列，也让用户知道该怎么改。
 *
 * 两层校验：
 *  1) checkImageRef —— 提交入口按 dataURL 的 mime / URL 的后缀快速判断（省一次上游往返）。
 *  2) checkImageBytes —— worker 下到真实字节后按魔数判断，识破“.jpg 后缀其实是 HEIC”的伪装。
 */

/** 上游友好的位图 mime 白名单 */
export const FRIENDLY_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'];
const FRIENDLY_LABEL = 'PNG / JPG / WEBP';

/** 已知不友好后缀 → 展示名（用于 URL 引用的快速判断） */
const BAD_EXT: Record<string, string> = {
  heic: 'HEIC',
  heif: 'HEIF',
  gif: 'GIF',
  bmp: 'BMP',
  tif: 'TIFF',
  tiff: 'TIFF',
  svg: 'SVG',
  avif: 'AVIF',
};

/** 格式不友好时抛出；上层据此转成 400 提示或任务错误 */
export class UnsupportedImageError extends Error {
  constructor(found: string) {
    super(
      `不支持的图片格式（${found}）。请上传 ${FRIENDLY_LABEL} 格式的图片` +
        `（iPhone 拍摄的 HEIC 请先在相册导出/转成 JPG 再上传）。`,
    );
    this.name = 'UnsupportedImageError';
  }
}

/**
 * 提交入口用：对「参考图字符串」（dataURL 或 http(s) URL）做轻量格式校验。
 * - dataURL：直接看 mime，非白名单即拒。
 * - URL：看后缀；已知坏后缀拒，未知/友好后缀放行（真实格式交给 worker 按字节兜底）。
 * 空值直接放行（是否必填由各自 DTO 决定）。
 */
export function checkImageRef(image?: string | null): void {
  if (!image) return;
  if (image.startsWith('data:')) {
    const mime = /^data:([^;,]+)/.exec(image)?.[1]?.toLowerCase() ?? '';
    if (!FRIENDLY_IMAGE_MIMES.includes(mime)) {
      throw new UnsupportedImageError(mime || 'dataURL 缺少 mime');
    }
    return;
  }
  let ext = '';
  try {
    ext = new URL(image).pathname.split('.').pop()?.toLowerCase() ?? '';
  } catch {
    return; // URL 解析失败不在本校验职责内，交由后续下载环节报错
  }
  if (BAD_EXT[ext]) throw new UnsupportedImageError(BAD_EXT[ext]);
}

/**
 * worker 用：拿到真实字节后按文件魔数判断真实格式，非 PNG/JPEG/WEBP 即拒。
 * 能识破后缀/Content-Type 与实际内容不符的情况（HEIC 伪装成 .jpg 最常见）。
 */
export function checkImageBytes(buf: Buffer): void {
  const { label, friendly } = sniffImage(buf);
  if (!friendly) throw new UnsupportedImageError(label);
}

/** 按魔数识别图片真实格式 */
function sniffImage(b: Buffer): { label: string; friendly: boolean } {
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  )
    return { label: 'PNG', friendly: true };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { label: 'JPEG', friendly: true };
  if (
    b.length >= 12 &&
    b.toString('ascii', 0, 4) === 'RIFF' &&
    b.toString('ascii', 8, 12) === 'WEBP'
  )
    return { label: 'WEBP', friendly: true };

  // 以下为常见不友好格式，识别出来是为了给更准确的提示
  if (b.length >= 3 && b.toString('ascii', 0, 3) === 'GIF')
    return { label: 'GIF', friendly: false };
  if (b.length >= 2 && b[0] === 0x42 && b[1] === 0x4d)
    return { label: 'BMP', friendly: false };
  if (
    b.length >= 4 &&
    ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00))
  )
    return { label: 'TIFF', friendly: false };
  // ISO-BMFF 容器：字节 4-8 为 'ftyp'，brand 区分 HEIC/HEIF/AVIF
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp') {
    const brand = b.toString('ascii', 8, 12);
    if (/hei|mif1|msf1/i.test(brand))
      return { label: 'HEIC/HEIF', friendly: false };
    if (/avif|avis/i.test(brand)) return { label: 'AVIF', friendly: false };
    return { label: `ftyp:${brand}`, friendly: false };
  }
  const head = b.subarray(0, 256).toString('ascii').trim().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg'))
    return { label: 'SVG', friendly: false };

  return { label: '无法识别的图片', friendly: false };
}
