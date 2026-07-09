import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  type UploadScene,
} from '../../storage/storage.interface';

const MAX_BYTES = 8 * 1024 * 1024;

@Injectable()
export class UploadService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** 直传签名（OSS） */
  createSignature(userId: string, scene: UploadScene, ext?: string) {
    if (!this.storage.createUploadSignature) {
      throw new BadRequestException(
        '当前存储不支持直传签名（请配置 STORAGE_PROVIDER=oss）',
      );
    }
    return this.storage.createUploadSignature({ scene, ext, userId });
  }

  /** 服务端代传（dataURL） */
  async uploadDataUrl(
    userId: string,
    dataUrl: string,
  ): Promise<{ url: string }> {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
    if (!match) throw new BadRequestException('无效的 dataUrl');
    const contentType = match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_BYTES)
      throw new BadRequestException('图片超过 8MB');

    const ext = contentType.split('/')[1] ?? 'png';
    const key = `upload/general/${userId}/${randomUUID()}.${ext}`;
    const url = await this.storage.put(key, buffer, contentType);
    return { url };
  }
}
