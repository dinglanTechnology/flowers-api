import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

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
    enum: ['flower', 'greenery', 'line', 'vase'],
    description: '素材类型',
    example: 'flower',
  })
  @IsIn(['flower', 'greenery', 'line', 'vase'])
  category!: string;

  @ApiProperty({
    maxLength: 20,
    description: '花材名（过文本审核）',
    example: '院子里的月季',
  })
  @IsString()
  @MaxLength(20)
  name!: string;

  @ApiProperty({ description: '照片链接（原图 OSS URL）' })
  @IsString()
  sourceImageUrl!: string;
}
