import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomMaterial } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomMaterialDto } from './dto/create-custom-material.dto';
import {
  BUILTIN_MATERIALS,
  MATERIAL_CATEGORIES,
  MATERIALS_VERSION,
} from './builtin-materials.data';

function toCustomDto(m: CustomMaterial) {
  return {
    id: m.id,
    userId: m.userId,
    name: m.name,
    category: m.category,
    baseMaterialId: m.baseMaterialId,
    baseKind: m.baseKind,
    imageUrl: m.imageUrl,
    sourceImageUrl: m.sourceImageUrl,
    createdAt: m.createdAt.toISOString(),
  };
}

@Injectable()
export class MaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 内置素材目录（版本化） */
  getCatalog(clientVersion?: string) {
    if (clientVersion && clientVersion === MATERIALS_VERSION) {
      return { version: MATERIALS_VERSION, changed: false };
    }
    return {
      version: MATERIALS_VERSION,
      categories: MATERIAL_CATEGORIES,
      materials: BUILTIN_MATERIALS,
    };
  }

  async listCustom(userId: string) {
    const rows = await this.prisma.customMaterial.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toCustomDto);
  }

  async createCustom(userId: string, dto: CreateCustomMaterialDto) {
    const created = await this.prisma.customMaterial.create({
      data: {
        userId,
        name: dto.name,
        category: dto.category,
        baseMaterialId: dto.baseMaterialId,
        baseKind: dto.baseKind ?? null,
        imageUrl: dto.imageUrl,
        sourceImageUrl: dto.sourceImageUrl ?? null,
      },
    });
    return toCustomDto(created);
  }

  async removeCustom(userId: string, id: string) {
    const found = await this.prisma.customMaterial.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('花材不存在');
    if (found.userId !== userId) throw new ForbiddenException('无权删除');
    await this.prisma.customMaterial.delete({ where: { id } });
    return { ok: true };
  }
}
