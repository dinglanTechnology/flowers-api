import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomMaterialDto {
  @ApiProperty({
    maxLength: 20,
    description: '素材名（过文本审核）',
    example: '阳台茉莉',
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

  @ApiProperty({ description: '抠图成品透明底 OSS URL' })
  @IsString()
  imageUrl!: string;

  @ApiProperty({ required: false, description: '上传原图 OSS URL' })
  @IsOptional()
  @IsString()
  sourceImageUrl?: string;
}
