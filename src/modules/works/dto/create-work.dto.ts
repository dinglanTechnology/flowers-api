import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const THEMES = ['night', 'light', 'morning', 'rouge', 'gallery', 'onyx'];

export class CreateWorkDto {
  @ApiProperty({ maxLength: 18, description: '作品标题', example: '今日花事' })
  @IsString()
  @MaxLength(18)
  title!: string;

  @ApiProperty({
    enum: THEMES,
    description: '主题 id（见 GET /config/bootstrap 的 themes）',
    example: 'night',
  })
  @IsIn(THEMES)
  theme!: string;

  @ApiProperty({ description: '花器素材 id', example: 'mat-vase-ink' })
  @IsString()
  vaseId!: string;

  @ApiProperty({
    type: Object,
    additionalProperties: true,
    description: '插花数据快照（后端不透明，仅结构校验）',
    example: { items: [], theme: 'night', vaseId: 'mat-vase-ink' },
  })
  @IsObject()
  arrangement!: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'dataURL（服务端转存 OSS）或已直传的 OSS URL',
  })
  @IsOptional()
  @IsString()
  thumbnail?: string;

  @ApiProperty({
    description: '日历聚合键 YYYY-MM-DD（客户端本地时区）',
    example: '2026-07-09',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateKey 需为 YYYY-MM-DD' })
  dateKey!: string;
}
