import { Injectable, Logger } from '@nestjs/common';
import { AiProvider, CutoutInput, Image2Input } from './ai-provider.interface';

/** Atlas Cloud 自研图像 API 的上游配置 */
export interface AtlasUpstreamConfig {
  name: string;
  /** 形如 https://api.atlascloud.ai/api/v1 */
  baseUrl: string;
  apiKey: string;
  image2Model: string;
  cutoutModel: string;
}

interface AtlasData {
  id?: string;
  status?: string; // processing | completed | succeeded | failed
  outputs?: string[]; // dataURL(base64) 或 https URL
  error?: string;
}
interface AtlasResponse {
  code?: number | string;
  message?: string;
  data?: AtlasData;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Atlas Cloud 原生图像接口（非 OpenAI 兼容）。
 * 统一入口 POST {base}/model/generateImage，用 enable_sync_mode + enable_base64_output 同步取结果。
 * 不同能力请求体不同：
 *  - image2（图生图）：generate 类模型（如 openai/gpt-image-2/edit），字段 images:[...] + prompt + size
 *  - cutout（抠图）：去背模型（youchuan/v8.1/remove-background），字段 image（单数），无 prompt，返回透明 PNG
 */
@Injectable()
export class AtlasProvider implements AiProvider {
  private readonly logger = new Logger(AtlasProvider.name);
  readonly name: string;
  private readonly base: string;
  private readonly apiKey: string;
  private readonly image2Model: string;
  private readonly cutoutModel: string;

  constructor(cfg: AtlasUpstreamConfig) {
    this.name = cfg.name;
    this.base = (cfg.baseUrl || 'https://api.atlascloud.ai/api/v1').replace(
      /\/+$/,
      '',
    );
    this.apiKey = cfg.apiKey;
    this.image2Model = cfg.image2Model;
    this.cutoutModel = cfg.cutoutModel;
  }

  image2(input: Image2Input): Promise<Buffer> {
    if (!input.image) {
      throw new Error(
        'image2 缺少参考图（Atlas edit 模型需要输入图 URL 或 base64）',
      );
    }
    return this.predict('image2', {
      model: this.image2Model,
      prompt: input.prompt,
      images: [input.image],
      size: input.size ?? '1024x1536',
      output_format: 'png',
    });
  }

  cutout(input: CutoutInput): Promise<Buffer> {
    if (!this.cutoutModel) {
      throw new Error('未配置抠图模型，抠图能力待接入');
    }
    if (!input.image) {
      throw new Error('cutout 缺少输入图');
    }
    // 去背模型：单 image 字段、无 prompt，输出带 alpha 的透明 PNG
    return this.predict('cutout', {
      model: this.cutoutModel,
      image: input.image,
    });
  }

  /** 提交一次 generateImage 并（同步/轮询）取回图片字节 */
  private async predict(
    op: string,
    body: Record<string, unknown>,
  ): Promise<Buffer> {
    const res = await fetch(`${this.base}/model/generateImage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        enable_sync_mode: true,
        enable_base64_output: true,
      }),
    });

    const json = (await res.json().catch(() => ({}))) as AtlasResponse;
    if (!res.ok) {
      throw new Error(
        `Atlas ${op} HTTP ${res.status}: ${json.message || JSON.stringify(json).slice(0, 200)}`,
      );
    }

    // 同步模式一般直接 completed；未同步则回退轮询
    let data = json.data;
    if (data && !this.isDone(data.status)) {
      data = await this.poll(op, data.id);
    }
    if (!data || data.status === 'failed') {
      throw new Error(`Atlas ${op} 任务失败: ${data?.error || '未知错误'}`);
    }
    const out = data.outputs?.[0];
    if (!out) throw new Error(`Atlas ${op} 返回为空`);
    return this.toBuffer(out);
  }

  private isDone(status?: string): boolean {
    return status === 'completed' || status === 'succeeded';
  }

  private async poll(op: string, id?: string): Promise<AtlasData> {
    if (!id) throw new Error(`Atlas ${op} 无 prediction id，无法轮询`);
    // 最多 ~2 分钟
    for (let i = 0; i < 60; i++) {
      await sleep(2000);
      const r = await fetch(`${this.base}/model/prediction/${id}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      const j = (await r.json().catch(() => ({}))) as AtlasResponse;
      const d = j.data;
      if (d && this.isDone(d.status)) return d;
      if (d?.status === 'failed') {
        throw new Error(`Atlas ${op} 任务失败: ${d.error || '未知错误'}`);
      }
    }
    throw new Error(`Atlas ${op} 轮询超时（prediction ${id}）`);
  }

  /** outputs[0] 可能是 dataURL(base64) 或 https URL */
  private async toBuffer(out: string): Promise<Buffer> {
    if (out.startsWith('data:')) {
      return Buffer.from(out.slice(out.indexOf(',') + 1), 'base64');
    }
    const r = await fetch(out);
    if (!r.ok) throw new Error(`下载 Atlas 结果失败: HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
}
