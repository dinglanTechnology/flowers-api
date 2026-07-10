import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import {
  AI_PROVIDER,
  type AiProvider,
} from './providers/ai-provider.interface';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '../../storage/storage.interface';
import { PrismaService } from '../../prisma/prisma.service';

export const AI_QUEUE = 'ai';

interface AiJobData {
  taskId: string;
  prompt?: string;
  image?: string;
}

/**
 * AI 任务 worker：调 provider(同步) → 存 OSS → 回写 AiTask。
 * job.name = 'image2' | 'cutout'
 */
@Processor(AI_QUEUE)
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);
  private readonly jobTimeoutMs: number;

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    super();
    this.jobTimeoutMs = config.get<number>('ai.jobTimeoutMs') ?? 300_000;
  }

  async process(job: Job<AiJobData>): Promise<void> {
    const { taskId } = job.data;
    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: { status: 'running', progress: 30 },
    });

    try {
      // 兜底整体超时：防止 provider 之外（OSS 上传 / DB）挂起导致任务永远 running
      await this.withTimeout(this.handle(job), taskId);
    } catch (error) {
      const msg = (error as Error).message;
      // attemptsMade 在本次抛出后才自增，故 +1 判断是否已是最后一次
      const attempts = job.opts.attempts ?? 1;
      const isLastAttempt = job.attemptsMade + 1 >= attempts;
      this.logger.warn(
        `AI 任务 ${taskId} 失败（第 ${job.attemptsMade + 1}/${attempts} 次）: ${msg}`,
      );
      if (isLastAttempt) {
        await this.prisma.aiTask.update({
          where: { id: taskId },
          data: { status: 'failed', error: msg },
        });
      } else {
        // 还会重试：回退进度，保持非终态
        await this.prisma.aiTask.update({
          where: { id: taskId },
          data: { progress: 5, error: msg },
        });
      }
      // 抛出让 BullMQ 计为失败并按 attempts/backoff 重试
      throw error;
    }
  }

  /** 实际处理：调上游 → 存 OSS → 标记成功 */
  private async handle(job: Job<AiJobData>): Promise<void> {
    const { taskId } = job.data;
    this.logger.log(`AI 任务 ${taskId}（${job.name}）开始调用上游…`);
    const buffer =
      job.name === 'cutout'
        ? await this.ai.cutout({
            image: job.data.image ?? '',
            prompt: job.data.prompt,
          })
        : await this.ai.image2({
            prompt: job.data.prompt ?? '',
            image: job.data.image,
          });

    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: { progress: 80 },
    });

    const key = `ai/${job.name}/${taskId}.png`;
    const url = await this.storage.put(key, buffer, 'image/png');

    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: { status: 'succeeded', progress: 100, resultUrl: url },
    });
  }

  /** 给一段处理加整体超时；超时抛出可读错误 */
  private withTimeout<T>(p: Promise<T>, taskId: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`任务 ${taskId} 处理超时（>${this.jobTimeoutMs}ms）`),
          ),
        this.jobTimeoutMs,
      );
    });
    return Promise.race([p, timeout]).finally(() =>
      clearTimeout(timer),
    ) as Promise<T>;
  }
}
