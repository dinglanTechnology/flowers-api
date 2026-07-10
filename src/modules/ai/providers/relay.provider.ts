import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import type { Uploadable } from 'openai/uploads';
import { AiProvider, CutoutInput, Image2Input } from './ai-provider.interface';

/** 单个中转站上游的配置（一个中转站对应一份） */
export interface RelayUpstreamConfig {
  /** 标识，用于日志/故障转移（如 atlas、tokenlab） */
  name: string;
  baseUrl: string;
  apiKey: string;
  image2Model: string;
  cutoutModel: string;
  /** 单次上游请求超时（ms） */
  timeoutMs: number;
}

/** 中转站返回的图片项：b64 或 url 二选一 */
type ImageResult = { data?: Array<{ b64_json?: string; url?: string }> };

/**
 * 第三方 OpenAI 兼容中转站实现（AI_PROVIDER=relay）。
 * 一个实例对应一个上游中转站；多上游的主/备切换见 FailoverProvider。
 * 上游同步出图，由 AiProcessor 队列包装成异步。
 */
@Injectable()
export class RelayProvider implements AiProvider {
  private readonly logger = new Logger(RelayProvider.name);
  private readonly client: OpenAI;
  private readonly image2Model: string;
  private readonly cutoutModel: string;
  private readonly timeoutMs: number;
  /** 上游标识，供 FailoverProvider 打日志 */
  readonly name: string;

  constructor(cfg: RelayUpstreamConfig) {
    this.name = cfg.name;
    this.image2Model = cfg.image2Model;
    this.cutoutModel = cfg.cutoutModel;
    this.timeoutMs = cfg.timeoutMs > 0 ? cfg.timeoutMs : 120_000;
    this.client = new OpenAI({
      apiKey: cfg.apiKey || 'placeholder',
      baseURL: cfg.baseUrl || undefined,
      // 默认 10 分钟超时会让失败任务长时间卡在 running；收紧并只重试 1 次，便于快速故障转移
      timeout: this.timeoutMs,
      maxRetries: 1,
    });
  }

  async image2(input: Image2Input): Promise<Buffer> {
    const size = (input.size as never) ?? '1024x1536';
    // 有参考图 → 图生图走 images.edit（匹配 .../edit 模型）；无参考图 → 文生图走 images.generate
    const res = (
      input.image
        ? await this.client.images.edit({
            model: this.image2Model,
            image: await this.toUploadable(input.image),
            prompt: input.prompt,
            size,
          } as never)
        : await this.client.images.generate({
            model: this.image2Model,
            prompt: input.prompt,
            size,
          } as never)
    ) as ImageResult;
    return this.extractImage(res, 'image2');
  }

  async cutout(input: CutoutInput): Promise<Buffer> {
    if (!this.cutoutModel) {
      throw new Error('未配置抠图模型，抠图能力待接入');
    }
    // 抠图 = 对原图做图像编辑（image-edit），移除背景输出透明底 PNG。
    // 注意：只发 model+image+prompt 这类通用字段。TokenLab 的 gpt-image-2 对
    // 不在其 public contract 内的参数会直接 400（实测 background='transparent'、
    // size='auto' 均不被接受），透明底只能靠 prompt 兜底。
    // 真·透明底以 atlas 的专用去背模型为准，本路径是备用、尽力而为。
    const res = (await this.client.images.edit({
      model: this.cutoutModel,
      image: await this.toUploadable(input.image),
      prompt:
        input.prompt ??
        '精确移除背景，只保留主体花材/植物，边缘干净无残留，输出透明背景 PNG',
    } as never)) as ImageResult;
    return this.extractImage(res, 'cutout');
  }

  /** 从中转站响应取出图片字节：优先 b64，其次 url 回源下载 */
  private async extractImage(res: ImageResult, op: string): Promise<Buffer> {
    const item = res?.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
    if (item?.url) {
      const r = await fetch(item.url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return Buffer.from(await r.arrayBuffer());
    }
    throw new Error(`${op} 中转站 ${this.name} 返回为空`);
  }

  /** 把 dataURL / http(s) URL 的图片转成 SDK 可上传的文件对象 */
  private async toUploadable(image: string): Promise<Uploadable> {
    let buffer: Buffer;
    let mime = 'image/png';
    if (image.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
      if (!m) throw new Error('无法解析 dataURL 参考图');
      mime = m[1] || mime;
      buffer = Buffer.from(m[2], 'base64');
    } else {
      const r = await fetch(image, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!r.ok) throw new Error(`下载参考图失败: HTTP ${r.status}`);
      mime = r.headers.get('content-type') || mime;
      buffer = Buffer.from(await r.arrayBuffer());
    }
    const ext = /jpe?g/.test(mime)
      ? 'jpg'
      : mime.includes('webp')
        ? 'webp'
        : 'png';
    return toFile(buffer, `input.${ext}`, { type: mime });
  }
}
