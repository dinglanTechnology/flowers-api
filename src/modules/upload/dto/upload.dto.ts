import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

const SCENES = [
  'cutout-source',
  'export-reference',
  'work-thumbnail',
  'general',
];

export class SignatureDto {
  @ApiProperty({
    enum: SCENES,
    description: '上传场景，决定 OSS key 前缀与大小/类型限制',
    example: 'work-thumbnail',
  })
  @IsIn(SCENES)
  scene!: string;

  @ApiProperty({ required: false, description: '文件扩展名', example: 'png' })
  @IsOptional()
  @IsString()
  ext?: string;
}

export class UploadDataUrlDto {
  @ApiProperty({
    description: '图片 dataURL（image/png|jpeg|webp，≤8MB）',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  @IsString()
  dataUrl!: string;
}
