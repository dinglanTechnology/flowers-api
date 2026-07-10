import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID } from 'crypto';
import OSS from 'ali-oss';
import {
  StorageProvider,
  UploadScene,
  UploadSignature,
  UploadSignatureInput,
} from './storage.interface';

interface OssConfig {
  region: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  cdnBase: string;
}

const SCENE_PREFIX: Record<UploadScene, string> = {
  'cutout-source': 'upload/cutout-source',
  'export-reference': 'upload/export-reference',
  'work-thumbnail': 'upload/work-thumbnail',
  general: 'upload/general',
};
const SCENE_MAX: Record<UploadScene, number> = {
  'cutout-source': 8 * 1024 * 1024,
  'export-reference': 8 * 1024 * 1024,
  'work-thumbnail': 4 * 1024 * 1024,
  general: 8 * 1024 * 1024,
};

/** 阿里云 OSS 存储实现 */
@Injectable()
export class OssStorage implements StorageProvider {
  private readonly client: OSS;
  private readonly cfg: OssConfig;

  constructor(config: ConfigService) {
    this.cfg = config.get<OssConfig>('storage.oss')!;
    this.client = new OSS({
      region: this.cfg.region,
      bucket: this.cfg.bucket,
      accessKeyId: this.cfg.accessKeyId,
      accessKeySecret: this.cfg.accessKeySecret,
      endpoint: this.cfg.endpoint || undefined,
      // 小程序 <image>/downloadFile 要求 https；确保 put() 返回的 result.url 为 https
      secure: true,
    });
  }

  async put(key: string, buffer: Buffer, contentType: string): Promise<string> {
    const result = await this.client.put(key, buffer, { mime: contentType });
    return this.cfg.cdnBase ? `${this.cfg.cdnBase}/${key}` : result.url;
  }

  createUploadSignature(input: UploadSignatureInput): Promise<UploadSignature> {
    const prefix = SCENE_PREFIX[input.scene] ?? SCENE_PREFIX.general;
    const maxSize = SCENE_MAX[input.scene] ?? SCENE_MAX.general;
    const ext =
      (input.ext || 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png';
    const key = `${prefix}/${input.userId}/${randomUUID()}.${ext}`;
    const expire = Math.floor(Date.now() / 1000) + 300;

    const policyObj = {
      expiration: new Date(expire * 1000).toISOString(),
      conditions: [
        ['content-length-range', 0, maxSize],
        ['starts-with', '$key', prefix],
      ],
    };
    const policy = Buffer.from(JSON.stringify(policyObj)).toString('base64');
    const signature = createHmac('sha1', this.cfg.accessKeySecret)
      .update(policy)
      .digest('base64');
    const host =
      this.cfg.endpoint ||
      `https://${this.cfg.bucket}.${this.cfg.region}.aliyuncs.com`;
    const fileUrl = this.cfg.cdnBase
      ? `${this.cfg.cdnBase}/${key}`
      : `${host}/${key}`;

    return Promise.resolve({
      mode: 'post-policy',
      host,
      key,
      policy,
      signature,
      ossAccessKeyId: this.cfg.accessKeyId,
      expire,
      maxSize,
      fileUrl,
    });
  }
}
