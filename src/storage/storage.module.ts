import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './storage.interface';
import { OssStorage } from './oss.storage';
import { MinioStorage } from './minio.storage';

/** 全局存储模块：按 STORAGE_PROVIDER 选择 OSS / MinIO 实现 */
@Global()
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('storage.provider') === 'oss'
          ? new OssStorage(config)
          : new MinioStorage(),
    },
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
