import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AiTask } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AI_QUEUE } from './ai.processor';
import { Image2Dto, CutoutDto } from './dto/ai.dto';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(AI_QUEUE) private readonly queue: Queue,
  ) {}

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
    await this.queue.add('image2', {
      taskId: task.id,
      prompt: dto.prompt,
      image,
    });
    return { taskId: task.id, status: task.status, progress: task.progress };
  }

  async submitCutout(userId: string, dto: CutoutDto) {
    const image = dto.sourceImageUrl ?? dto.sourceImage;
    const task = await this.prisma.aiTask.create({
      data: {
        userId,
        type: 'cutout',
        status: 'pending',
        progress: 5,
        prompt: dto.prompt ?? null,
        inputImageUrl: dto.sourceImageUrl ?? null,
        meta: {
          name: dto.name,
          category: dto.category,
          baseMaterialId: dto.baseMaterialId,
          baseKind: dto.baseKind ?? null,
        },
      },
    });
    await this.queue.add('cutout', {
      taskId: task.id,
      prompt: dto.prompt,
      image,
    });
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
