import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProcessor, AI_QUEUE } from './ai.processor';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import { MockProvider } from './providers/mock.provider';
import { RelayProvider } from './providers/relay.provider';

function parseRedis(url?: string): { host: string; port: number; password?: string } {
  try {
    const u = new URL(url ?? 'redis://localhost:6379');
    return {
      host: u.hostname,
      port: Number(u.port || 6379),
      ...(u.password ? { password: u.password } : {}),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedis(config.get<string>('redisUrl')),
      }),
    }),
    BullModule.registerQueue({ name: AI_QUEUE }),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiProcessor,
    {
      provide: AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('ai.provider') === 'relay'
          ? new RelayProvider(config)
          : new MockProvider(),
    },
  ],
  exports: [AiService],
})
export class AiModule {}
