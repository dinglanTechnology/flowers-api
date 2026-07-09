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

export class PlazaFeedDto extends PaginationDto {}

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
    required: false,
    maxLength: 18,
    description: '或直接提供作品信息：标题（过文本审核）',
  })
  @IsOptional()
  @IsString()
  @MaxLength(18)
  title?: string;

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
