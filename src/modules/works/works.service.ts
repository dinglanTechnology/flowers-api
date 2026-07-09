import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Work } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkDto } from './dto/create-work.dto';
import { UpdateWorkDto } from './dto/update-work.dto';

function toWorkDto(w: Work) {
  return {
    id: w.id,
    userId: w.userId,
    title: w.title,
    theme: w.theme,
    vaseId: w.vaseId,
    arrangement: w.arrangement,
    thumbnailUrl: w.thumbnailUrl,
    dateKey: w.dateKey,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

@Injectable()
export class WorksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkDto) {
    const created = await this.prisma.work.create({
      data: {
        userId,
        title: dto.title,
        theme: dto.theme,
        vaseId: dto.vaseId,
        arrangement: dto.arrangement as Prisma.InputJsonValue,
        // TODO(P5): thumbnail 为 dataURL 时转存 OSS，再存 URL
        thumbnailUrl: dto.thumbnail ?? null,
        dateKey: dto.dateKey,
      },
    });
    return toWorkDto(created);
  }

  /** 日历：某月每天的作品数量 */
  async calendar(
    userId: string,
    month?: string,
  ): Promise<Record<string, number>> {
    const rows = await this.prisma.work.groupBy({
      by: ['dateKey'],
      where: { userId, ...(month ? { dateKey: { startsWith: month } } : {}) },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) out[r.dateKey] = r._count._all;
    return out;
  }

  /** 某天作品列表；无 dateKey 则返回全部（近期在前） */
  async list(userId: string, dateKey?: string) {
    const rows = await this.prisma.work.findMany({
      where: { userId, ...(dateKey ? { dateKey } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toWorkDto);
  }

  async findOne(userId: string, id: string) {
    const work = await this.ensureOwned(userId, id);
    return toWorkDto(work);
  }

  async update(userId: string, id: string, dto: UpdateWorkDto) {
    await this.ensureOwned(userId, id);
    const updated = await this.prisma.work.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.theme !== undefined ? { theme: dto.theme } : {}),
        ...(dto.vaseId !== undefined ? { vaseId: dto.vaseId } : {}),
        ...(dto.arrangement !== undefined
          ? { arrangement: dto.arrangement as Prisma.InputJsonValue }
          : {}),
        ...(dto.thumbnail !== undefined ? { thumbnailUrl: dto.thumbnail } : {}),
        ...(dto.dateKey !== undefined ? { dateKey: dto.dateKey } : {}),
      },
    });
    return toWorkDto(updated);
  }

  async remove(userId: string, id: string) {
    await this.ensureOwned(userId, id);
    await this.prisma.work.delete({ where: { id } });
    return { ok: true };
  }

  private async ensureOwned(userId: string, id: string): Promise<Work> {
    const work = await this.prisma.work.findUnique({ where: { id } });
    if (!work) throw new NotFoundException('作品不存在');
    if (work.userId !== userId) throw new ForbiddenException('无权访问该作品');
    return work;
  }
}
