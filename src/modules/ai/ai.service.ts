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
 * 各类素材的抠图侧重点：四类难点不同，focus 只写该类特有难点，
 * 共性（识别主体 / 逐像素保真 / 去背 / 透明底）已由 CUTOUT_BASE 统管，不重复。
 * - flower：柔边花瓣 + 花蕊细节，半透明薄瓣易抠穿/留灰边，边缘忌抠成硬边
 * - greenery：叶片/枝条间的负空间要一起镂空，细茎叶尖卷须易断
 * - line：极细线条/草茎结构，最怕抠断、遗漏、被加粗削细、抗锯齿留描边
 * - vase：花瓶/容器硬边规整，瓶身纹饰要原样保留，玻璃透光反光与瓶口内壁易误抠
 */
const CUTOUT_CATEGORY: Record<string, { label: string; focus: string }> = {
  flower: {
    label: '花朵',
    focus:
      '主体是花朵，边缘柔和自然、常有半透明薄瓣：边缘要顺着花瓣的柔和过渡走，不要抠成生硬的锐利硬边、也不要过度向内收缩留下灰边或白边；薄瓣、透光花瓣不要整片抠穿或误当背景删掉；花蕊、花丝、花药、花粉等细节完整保留；重叠花瓣之间露出的背景缝隙要抠透；维持花朵原有的色彩层次与明暗渐变，不要提亮、加饱和或改色。',
  },
  greenery: {
    label: '枝叶',
    focus:
      '主体是枝叶 / 绿植，重点在负空间与细结构：叶片之间、枝条之间、以及叶与枝围出的所有空隙都要一并抠成透明，绝不能留背景色块或残影；细茎、叶柄、卷须、叶尖要根根完整，不断裂、不遗漏；锯齿状或羽状的叶缘要精确贴合轮廓；叶面绒毛与细齿边缘不要因抗锯齿留下灰白描边或光晕。',
  },
  line: {
    label: '线条材料',
    focus:
      '主体是极细的线条 / 枝条 / 草茎 / 干枝，最怕抠断和遗漏：务必逐根完整保留每一处细结构，不抠断、不吞掉，也不要把它加粗或削细、改变原有粗细；线条交叉、缠绕、分叉处围出的空隙要一并抠透；细边不要因抗锯齿留下灰白描边、光晕或锯齿。',
  },
  vase: {
    label: '花器',
    focus:
      '主体为花瓶 / 容器，硬质规整的瓶身轮廓要干净利落、完整贴合；瓶身表面的花纹、图案、纹饰、釉色与描金要原样保留，一根线条都不要改动或简化；玻璃或釉面的透光、高光和反光要保留，不要当作背景抠掉；瓶口内壁、把手镂空处的负空间要一并抠透，不留背景色块。',
  },
};

/**
 * 通用抠图要求（与分类无关的部分）。
 * 生成式 edit 模型最大的坑是「按提示重画一张」，会改掉主体的纹理/图案/文字。
 * 因此这里把任务钉死为「识别→去背」，并反复强调逐像素保真、严禁重绘。
 */
const CUTOUT_BASE =
  '这是一次抠图 / 去背景任务，不是重绘或重新生成任务。' +
  '第一步：在画面中准确识别并锁定上述主体（若画面有多个物体，以主体名称为准，只锁定这一个）。' +
  '第二步：只保留该主体，移除背景以及一切非主体元素——' +
  '其它物品、手、桌面、支架、道具、文字、水印、logo、边框等都要清除干净。' +
  '关键约束：只抹掉背景，绝不重画、重新生成、美化、补全、锐化或改动主体本身；' +
  '主体的轮廓、比例、颜色、材质、纹理、图案花纹与其上的文字必须与原图逐像素一致。' +
  '输出透明背景 PNG：主体完整不裁切，边缘干净、无白边与杂色残留，' +
  '不添加阴影、倒影、描边或任何额外元素。';

/**
 * 抠图 prompt 内置于后端：前端只给 类型/名字/照片链接，由后端拼 prompt。
 * 先用「主体名称」点明要抠的对象、强化识别与消歧，再接通用去背要求，
 * 最后按 category 追加该类型的针对性边缘侧重点。
 */
function buildCutoutPrompt(category: string, name: string): string {
  const c = CUTOUT_CATEGORY[category];
  const subject = c?.label ?? '主体';
  const focus = c?.focus ?? '';
  return `本图需要抠出的主体是${subject}（${name}）。${CUTOUT_BASE} ${focus}`;
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
    const url = t.resultUrl ?? undefined;
    return {
      status: t.status,
      progress: t.progress,
      imageUrl: url, // 与 image2 统一；Web 端读这个
      image: url, // @deprecated 兼容小程序旧字段
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
