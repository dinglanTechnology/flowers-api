import { IsIn, IsOptional, IsString } from 'class-validator';

const SCENES = ['cutout-source', 'export-reference', 'work-thumbnail', 'general'];

export class SignatureDto {
  @IsIn(SCENES)
  scene!: string;

  @IsOptional()
  @IsString()
  ext?: string;
}

export class UploadDataUrlDto {
  @IsString()
  dataUrl!: string;
}
