import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, CutoutInput, Image2Input } from './ai-provider.interface';
import { checkImageBytes } from '../image-format.util';

/** 火山方舟（Ark）上游配置 */
export interface ArkUpstreamConfig {
  /** 标识，用于日志/故障转移 */
  name: string;
  baseUrl: string;
  apiKey: string;
  image2Model: string;
  /** 单次上游请求超时（ms） */
  timeoutMs: number;
  /** 是否加 AI 水印（Ark 原生 watermark 参数） */
  watermark?: boolean;
}

interface ArkImageResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string; code?: string };
}

/**
 * 火山引擎方舟 doubao-seedream 文生图/图生图（protocol='ark'）。
 * 与 OpenAI 兼容层（RelayProvider）的差异：
 * - 图生图走 generations 端点的 image 字段（URL / base64 dataURL 字符串），不用 multipart edits
 * - size 直接接受 "宽x高"（如 1024x1536）；输出指定 output_format='png'
 * 抠图：seedream 是生成模型、无专用去背能力，cutout 抛错交给故障转移的下一个上游（atlas）。
 */
@Injectable()
export class ArkProvider implements AiProvider {
  private readonly logger = new Logger(ArkProvider.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly image2Model: string;
  private readonly timeoutMs: number;
  private readonly watermark: boolean;
  /** 上游标识，供 FailoverProvider 打日志 */
  readonly name: string;

  constructor(cfg: ArkUpstreamConfig) {
    this.name = cfg.name;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, '');
    this.apiKey = cfg.apiKey;
    this.image2Model = cfg.image2Model;
    this.timeoutMs = cfg.timeoutMs > 0 ? cfg.timeoutMs : 120_000;
    this.watermark = cfg.watermark ?? false;
  }

  async image2(input: Image2Input): Promise<Buffer> {
    // dataURL 参考图按真实字节校验格式（HEIC 等提前给可读错误）；http(s) URL 直接透传给上游拉取
    if (input.image?.startsWith('data:')) {
      const m = /^data:[^;]+;base64,(.*)$/s.exec(input.image);
      if (m) checkImageBytes(Buffer.from(m[1], 'base64'));
    }
    const body: Record<string, unknown> = {
      model: this.image2Model,
      prompt: input.prompt,
      size: input.size ?? '1024x1536',
      response_format: 'url',
      output_format: 'png',
      stream: false,
      watermark: this.watermark,
      ...(input.image ? { image: input.image } : {}),
    };
    const res = await fetch(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const json = (await res
      .json()
      .catch(() => null)) as ArkImageResponse | null;
    if (!res.ok) {
      throw new Error(
        `Ark image2 HTTP ${res.status}: ${json?.error?.message ?? '请求失败'}`,
      );
    }
    const item = json?.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
    if (item?.url) {
      const r = await fetch(item.url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!r.ok) throw new Error(`Ark image2 回源下载失败: HTTP ${r.status}`);
      this.logger.log(
        `image2 由 ark 出图（${input.image ? '图生图' : '文生图'}）`,
      );
      return Buffer.from(await r.arrayBuffer());
    }
    throw new Error('Ark image2 返回为空');
  }

  cutout(_input: CutoutInput): Promise<Buffer> {
    // seedream 无专用去背能力；抛错让 FailoverProvider 切到 atlas 专用去背模型
    throw new Error('ark 上游不支持抠图（seedream 为生成模型，无去背能力）');
  }
}
