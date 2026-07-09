import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiProvider, CutoutInput, Image2Input } from './ai-provider.interface';

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  image2Model: string;
  cutoutModel: string;
}

/**
 * 第三方 OpenAI 兼容中转站实现（AI_PROVIDER=relay）。
 * 上游同步出图，由 AiProcessor 队列包装成异步。
 */
@Injectable()
export class RelayProvider implements AiProvider {
  private readonly logger = new Logger(RelayProvider.name);
  private readonly client: OpenAI;
  private readonly image2Model: string;
  private readonly cutoutModel: string;

  constructor(config: ConfigService) {
    const ai = config.get<AiConfig>('ai')!;
    this.image2Model = ai.image2Model || 'gpt-image-1';
    this.cutoutModel = ai.cutoutModel;
    this.client = new OpenAI({
      apiKey: ai.apiKey || 'placeholder',
      baseURL: ai.baseUrl || undefined,
    });
  }

  async image2(input: Image2Input): Promise<Buffer> {
    // TODO(P5): input.image 为参考图时改走 images.edit 做图生图（取决于中转站模型能力）
    const res = (await this.client.images.generate({
      model: this.image2Model,
      prompt: input.prompt,
      size: (input.size as never) ?? '1024x1536',
    } as never)) as { data?: Array<{ b64_json?: string; url?: string }> };

    const item = res?.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
    if (item?.url) {
      const r = await fetch(item.url);
      return Buffer.from(await r.arrayBuffer());
    }
    throw new Error('image2 中转站返回为空');
  }

  async cutout(_input: CutoutInput): Promise<Buffer> {
    // 中转站抠图能力待确认（见 docs/api-spec.md §6）：
    // 若支持图像编辑 → images.edit 移除背景输出透明底；否则单独接抠图服务。
    if (!this.cutoutModel) {
      throw new Error('未配置 AI_CUTOUT_MODEL，抠图能力待接入');
    }
    throw new Error('RelayProvider.cutout 待实现（确认中转站抠图能力后补齐）');
  }
}
