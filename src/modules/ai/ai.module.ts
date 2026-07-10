import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiProcessor, AI_QUEUE } from './ai.processor';
import { AI_PROVIDER } from './providers/ai-provider.interface';
import { MockProvider } from './providers/mock.provider';
import { RelayProvider } from './providers/relay.provider';
import { AtlasProvider } from './providers/atlas.provider';
import { FailoverProvider, NamedProvider } from './providers/failover.provider';

/** 单个上游配置（含协议） */
interface UpstreamConfig {
  name: string;
  protocol: 'atlas' | 'openai';
  baseUrl: string;
  apiKey: string;
  image2Model: string;
  cutoutModel: string;
  timeoutMs: number;
  /** 仅 atlas：是否用同步出图模式；默认异步提交+轮询。openai 协议忽略 */
  syncMode?: boolean;
}

/** 按协议实例化对应 provider */
function buildProvider(u: UpstreamConfig): NamedProvider {
  return u.protocol === 'atlas' ? new AtlasProvider(u) : new RelayProvider(u);
}

function parseRedis(url?: string): {
  host: string;
  port: number;
  password?: string;
} {
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
      useFactory: (config: ConfigService) => {
        if (config.get<string>('ai.provider') !== 'relay') {
          return new MockProvider();
        }
        const upstreams = config.get<UpstreamConfig[]>('ai.upstreams') ?? [];
        if (upstreams.length === 0) {
          throw new Error(
            'AI_PROVIDER=relay 但未配置可用中转站，请填写 AI_ATLAS_API_KEY / AI_TOKENLAB_API_KEY',
          );
        }
        const providers = upstreams.map(buildProvider);
        // 单上游直接用，多上游包一层故障转移（主用 → 备用）
        return providers.length === 1
          ? providers[0]
          : new FailoverProvider(providers);
      },
    },
  ],
  exports: [AiService],
})
export class AiModule {}
