import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { JobsOptions, Queue } from 'bullmq';
import { AiTask } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_QUEUE } from './ai.processor';
import { Image2Dto, CutoutDto } from './dto/ai.dto';

const CATEGORY_LABEL: Record<string, string> = {
  flower: '花朵',
  greenery: '枝叶',
  line: '线条材料',
};

/**
 * 抠图 prompt 内置于后端：前端只给 类型/名字/照片链接，由后端拼 prompt。
 * category/name 仅用于点明主体、避免误抠；抠图统一输出透明底 PNG。
 */
function buildCutoutPrompt(category: string, name: string): string {
  const subject = CATEGORY_LABEL[category] ?? '主体';
  return `精确移除背景，只保留画面中的${subject}主体（${name}），边缘干净无残留、不裁切主体，输出透明背景 PNG。`;
}

@Injectable()
export class AiService {
  /** 队列任务默认选项：失败重试 + 指数退避，成功/失败后清理避免 Redis 堆积 */
  private readonly jobOpts: JobsOptions;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_QUEUE) private readonly queue: Queue,
    config: ConfigService,
  ) {
    this.jobOpts = {
      attempts: config.get<number>('ai.attempts') ?? 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: true,
      removeOnFail: 100,
    };
  }

  async submitImage2(userId: string, dto: Image2Dto) {
    const image = dto.referenceImageUrl ?? dto.referenceImage;
    const task = await this.prisma.aiTask.create({
      data: {
        userId,
        type: 'image2',
        status: 'pending',
        progress: 5,
        prompt: dto.prompt,
        inputImageUrl: dto.referenceImageUrl ?? null,
        meta: { size: dto.size ?? '1024x1536' },
      },
    });
    await this.queue.add(
      'image2',
      { taskId: task.id, prompt: dto.prompt, image },
      this.jobOpts,
    );
    return { taskId: task.id, status: task.status, progress: task.progress };
  }

  async submitCutout(userId: string, dto: CutoutDto) {
    // prompt 后端内置生成，前端不再传
    const prompt = buildCutoutPrompt(dto.category, dto.name);
    const task = await this.prisma.aiTask.create({
      data: {
        userId,
        type: 'cutout',
        status: 'pending',
        progress: 5,
        prompt,
        inputImageUrl: dto.sourceImageUrl,
        meta: {
          name: dto.name,
          category: dto.category,
        },
      },
    });
    await this.queue.add(
      'cutout',
      { taskId: task.id, prompt, image: dto.sourceImageUrl },
      this.jobOpts,
    );
    return { taskId: task.id, status: task.status, progress: task.progress };
  }

  async getImage2Task(userId: string, taskId: string) {
    const t = await this.ensureOwned(userId, taskId);
    return {
      status: t.status,
      progress: t.progress,
      imageUrl: t.resultUrl ?? undefined,
      error: t.error ?? undefined,
    };
  }

  async getCutoutTask(userId: string, taskId: string) {
    const t = await this.ensureOwned(userId, taskId);
    return {
      status: t.status,
      progress: t.progress,
      image: t.resultUrl ?? undefined,
      error: t.error ?? undefined,
    };
  }

  private async ensureOwned(userId: string, taskId: string): Promise<AiTask> {
    const task = await this.prisma.aiTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException('任务不存在');
    if (task.userId !== userId) throw new ForbiddenException('无权访问该任务');
    return task;
  }
}
