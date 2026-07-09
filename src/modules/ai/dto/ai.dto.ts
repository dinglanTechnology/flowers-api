import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class Image2Dto {
  @ApiProperty({ description: '出图 prompt（客户端 buildImage2Prompt）' })
  @IsString()
  prompt!: string;

  @ApiProperty({
    required: false,
    description: '参考图 OSS URL（推荐，与 referenceImage 二选一）',
  })
  @IsOptional()
  @IsString()
  referenceImageUrl?: string;

  @ApiProperty({
    required: false,
    description: '参考图 dataURL（兼容，与 referenceImageUrl 二选一）',
  })
  @IsOptional()
  @IsString()
  referenceImage?: string;

  @ApiProperty({ required: false, default: '1024x1536', example: '1024x1536' })
  @IsOptional()
  @IsString()
  size?: string;
}

export class CutoutDto {
  @ApiProperty({
    required: false,
    description: '原图 OSS URL（推荐，与 sourceImage 二选一）',
  })
  @IsOptional()
  @IsString()
  sourceImageUrl?: string;

  @ApiProperty({
    required: false,
    description: '原图 dataURL（兼容，与 sourceImageUrl 二选一）',
  })
  @IsOptional()
  @IsString()
  sourceImage?: string;

  @ApiProperty({
    maxLength: 20,
    description: '素材名（过文本审核）',
    example: '院子里的月季',
  })
  @IsString()
  @MaxLength(20)
  name!: string;

  @ApiProperty({ enum: ['flower', 'greenery', 'line'], example: 'flower' })
  @IsIn(['flower', 'greenery', 'line'])
  category!: string;

  @ApiProperty({ description: '基于哪个内置素材', example: 'mat-rose' })
  @IsString()
  baseMaterialId!: string;

  @ApiProperty({
    required: false,
    description: '基础形态 kind',
    example: 'rose',
  })
  @IsOptional()
  @IsString()
  baseKind?: string;

  @ApiProperty({ required: false, default: 'front', example: 'front' })
  @IsOptional()
  @IsString()
  view?: string;

  @ApiProperty({ required: false, default: true, description: '是否透明底' })
  @IsOptional()
  @IsBoolean()
  transparentBackground?: boolean;

  @ApiProperty({
    required: false,
    description: '抠图 prompt（客户端 buildCutoutPrompt）',
  })
  @IsOptional()
  @IsString()
  prompt?: string;
}
