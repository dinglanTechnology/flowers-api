import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { CustomMaterial, Material } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomMaterialDto } from './dto/create-custom-material.dto';
import { MATERIAL_CATEGORIES } from './builtin-materials.data';

function toBuiltinDto(m: Material) {
  // 前端纯贴图，只下发图片相关字段；kind/colors/shape 等矢量字段不下发（仅用于生成 PNG）
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    imageUrl: m.imageUrl,
    // styles 已在 seed 时存成 [{styleOption,name,imageUrl}]；单样式素材（花器等）为 null
    styles: m.styles ?? null,
  };
}

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

  /**
   * 默认素材目录（版本化）。分类为结构性枚举，留在代码；素材从 Material 表读，
   * 支持后台上下架（active）/ 换图 / 调序（sortOrder）而不发版。
   * 版本号由 DB 内容算出：换图或上下架改变 updatedAt → version 变 → 客户端自动拉新。
   */
  async getCatalog(clientVersion?: string) {
    const rows = await this.prisma.material.findMany({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
    });

    const version = createHash('sha256')
      .update(
        JSON.stringify(
          rows.map((m) => [
            m.id,
            m.imageUrl,
            m.sortOrder,
            m.updatedAt.toISOString(),
          ]),
        ),
      )
      .digest('hex')
      .slice(0, 12);

    if (clientVersion && clientVersion === version) {
      return { version, changed: false };
    }
    return {
      version,
      categories: MATERIAL_CATEGORIES,
      materials: rows.map(toBuiltinDto),
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
    const found = await this.prisma.customMaterial.findUnique({
      where: { id },
    });
    if (!found) throw new NotFoundException('花材不存在');
    if (found.userId !== userId) throw new ForbiddenException('无权删除');
    await this.prisma.customMaterial.delete({ where: { id } });
    return { ok: true };
  }
}
