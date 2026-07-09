import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AI_PROVIDER, type AiProvider } from './providers/ai-provider.interface';
import { STORAGE_PROVIDER, type StorageProvider } from '../../storage/storage.interface';
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

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<AiJobData>): Promise<void> {
    const { taskId } = job.data;
    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: { status: 'running', progress: 30 },
    });

    try {
      const buffer =
        job.name === 'cutout'
          ? await this.ai.cutout({ image: job.data.image ?? '', prompt: job.data.prompt })
          : await this.ai.image2({ prompt: job.data.prompt ?? '', image: job.data.image });

      await this.prisma.aiTask.update({ where: { id: taskId }, data: { progress: 80 } });

      const key = `ai/${job.name}/${taskId}.png`;
      const url = await this.storage.put(key, buffer, 'image/png');

      await this.prisma.aiTask.update({
        where: { id: taskId },
        data: { status: 'succeeded', progress: 100, resultUrl: url },
      });
    } catch (error) {
      this.logger.warn(`AI 任务 ${taskId} 失败: ${(error as Error).message}`);
      await this.prisma.aiTask.update({
        where: { id: taskId },
        data: { status: 'failed', error: (error as Error).message },
      });
    }
  }
}
