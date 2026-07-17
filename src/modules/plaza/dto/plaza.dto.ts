import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const THEMES = ['night', 'light', 'morning', 'rouge', 'gallery', 'onyx'];

/** feed 排序：latest 最新 / mostLiked 最赞 / hottest 最热（具体 tie-break 见 service） */
const SORTS = ['latest', 'mostLiked', 'hottest'] as const;
export type PlazaSort = (typeof SORTS)[number];

export class PlazaFeedDto extends PaginationDto {
  @ApiProperty({
    required: false,
    enum: SORTS,
    default: 'latest',
    description:
      'latest 发布时间倒序→点赞数倒序；mostLiked 点赞数倒序→发布时间倒序；hottest 浏览量倒序→点赞数倒序→发布时间倒序',
  })
  @IsOptional()
  @IsIn(SORTS)
  sort?: PlazaSort;
}

export class SharePlazaDto {
  @ApiProperty({
    required: false,
    description: '由已有作品分享（与下方作品信息二选一）',
    example: 'ckwork123',
  })
  @IsOptional()
  @IsString()
  workId?: string;

  @ApiProperty({
    maxLength: 16,
    description: '发布标题（过文本审核；默认「今日花事」由前端填充）',
    example: '今日花事',
  })
  @IsString()
  @MaxLength(16)
  title!: string;

  @ApiProperty({ required: false, enum: THEMES, example: 'night' })
  @IsOptional()
  @IsIn(THEMES)
  theme?: string;

  @ApiProperty({
    required: false,
    type: Object,
    additionalProperties: true,
    description: '插花数据快照',
  })
  @IsOptional()
  @IsObject()
  arrangement?: Record<string, unknown>;

  @ApiProperty({ required: false, description: '缩略图 OSS URL' })
  @IsOptional()
  @IsString()
  thumbnail?: string;
}

export class ViewPlazaDto {
  @ApiProperty({
    required: false,
    maxLength: 64,
    description:
      '未登录访客的匿名 ID（设备 ID / localStorage ID）；登录用户无需传',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  anonId?: string;
}
