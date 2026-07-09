import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma 已连接数据库');
    } catch (error) {
      // 允许在数据库未启动时也能启动服务（便于查看 /api/docs）；实际请求会报错
      this.logger.error(
        `Prisma 连接失败（请确认已执行 docker-compose up 启动数据库）: ${(error as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
