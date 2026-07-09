import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** 全局共享的 Redis 客户端（复用 REDIS_URL），供 refreshToken、微信 access_token 缓存等使用 */
@Injectable()
export class RedisService
  extends Redis
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RedisService.name);

  constructor(config: ConfigService) {
    super(config.get<string>('redisUrl') ?? 'redis://localhost:6379', {
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
      this.logger.log('Redis 已连接');
    } catch (error) {
      this.logger.error(`Redis 连接失败: ${(error as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    this.disconnect();
  }
}
