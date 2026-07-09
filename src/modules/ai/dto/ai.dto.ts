import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class Image2Dto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsString()
  referenceImageUrl?: string;

  @IsOptional()
  @IsString()
  referenceImage?: string; // dataURL（兼容）

  @IsOptional()
  @IsString()
  size?: string;
}

export class CutoutDto {
  @IsOptional()
  @IsString()
  sourceImageUrl?: string;

  @IsOptional()
  @IsString()
  sourceImage?: string; // dataURL（兼容）

  @IsString()
  @MaxLength(20)
  name!: string;

  @IsIn(['flower', 'greenery', 'line'])
  category!: string;

  @IsString()
  baseMaterialId!: string;

  @IsOptional()
  @IsString()
  baseKind?: string;

  @IsOptional()
  @IsString()
  view?: string;

  @IsOptional()
  @IsBoolean()
  transparentBackground?: boolean;

  @IsOptional()
  @IsString()
  prompt?: string;
}
