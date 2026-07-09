import { Injectable } from '@nestjs/common';
import { AiProvider, CutoutInput, Image2Input } from './ai-provider.interface';

/** 1x1 透明 PNG，本地开发占位，免调外部 API */
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** 本地开发 Mock 实现（AI_PROVIDER=mock） */
@Injectable()
export class MockProvider implements AiProvider {
  image2(_input: Image2Input): Promise<Buffer> {
    return Promise.resolve(PLACEHOLDER_PNG);
  }

  cutout(_input: CutoutInput): Promise<Buffer> {
    return Promise.resolve(PLACEHOLDER_PNG);
  }
}
