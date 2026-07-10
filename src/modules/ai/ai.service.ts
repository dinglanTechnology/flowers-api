import {
  BadRequestException,
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
import { checkImageRef, UnsupportedImageError } from './image-format.util';

/**
 * 各类素材的抠图侧重点：三类难点不同，prompt 分开调优。
 * - flower：柔边花瓣 + 花蕊细节，半透明薄瓣易抠穿/留灰边
 * - greenery：叶片/枝条间的负空间要一起镂空，细茎叶尖易断
 * - line：极细线条/草茎结构，最怕抠断、遗漏、抗锯齿留描边
 */
const CUTOUT_CATEGORY: Record<string, { label: string; focus: string }> = {
  flower: {
    label: '花朵',
    focus:
      '保留花瓣柔和的自然边缘和花蕊细节；半透明或较薄的花瓣不要抠穿、边缘不要留灰边；维持花朵原有的层次与色彩。',
  },
  greenery: {
    label: '枝叶',
    focus:
      '叶片之间、枝条之间的空隙（负空间）也要一并抠成透明，不能留背景色块；细茎、叶柄、叶尖要完整不断裂；锯齿状叶缘精确贴合。',
  },
  line: {
    label: '线条材料',
    focus:
      '主体是极细的线条 / 枝条 / 草茎，务必完整保留每一根细结构、绝不抠断或遗漏；细边不要因抗锯齿留下灰白描边或光晕。',
  },
};

/** 通用抠图要求（与分类无关的部分） */
const CUTOUT_BASE =
  '精确抠出主体并移除背景，输出透明背景 PNG。' +
  '要求：主体完整不裁切，边缘干净、无白边与杂色残留；' +
  '不要添加阴影、倒影、描边或任何额外元素，不改变主体本身的颜色和形状。';

/**
 * 抠图 prompt 内置于后端：前端只给 类型/名字/照片链接，由后端拼 prompt。
 * 通用要求 + 按 category 追加该类型的针对性侧重点；name 用于点明主体、避免误抠。
 */
function buildCutoutPrompt(category: string, name: string): string {
  const c = CUTOUT_CATEGORY[category];
  const subject = c?.label ?? '主体';
  const focus = c?.focus ?? '';
  return `${CUTOUT_BASE} 本图主体为${subject}（${name}）。${focus}`;
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

  /** 提交前拦掉上游不友好的图片格式，直接回 400 提示（避免白跑一趟队列） */
  private assertFriendlyImage(image?: string | null) {
    try {
      checkImageRef(image);
    } catch (e) {
      if (e instanceof UnsupportedImageError) {
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }

  async submitImage2(userId: string, dto: Image2Dto) {
    const image = dto.referenceImageUrl ?? dto.referenceImage;
    this.assertFriendlyImage(image);
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
    this.assertFriendlyImage(dto.sourceImageUrl);
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
