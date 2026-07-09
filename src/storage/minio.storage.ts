import { Injectable, Logger } from '@nestjs/common';
import { StorageProvider } from './storage.interface';

/**
 * 开发态存储：把对象内联为 data URL 返回，无需外部依赖即可让上传/AI 流程跑通。
 * 生产请用 OSS（STORAGE_PROVIDER=oss）。直传签名在此不支持（开发走服务端代传）。
 */
@Injectable()
export class MinioStorage implements StorageProvider {
  private readonly logger = new Logger(MinioStorage.name);

  put(_key: string, buffer: Buffer, contentType: string): Promise<string> {
    this.logger.debug(`[dev-inline] 存储对象 ${_key}（${buffer.length} 字节）`);
    return Promise.resolve(`data:${contentType};base64,${buffer.toString('base64')}`);
  }
}
