import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCustomMaterialDto {
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

  @IsString()
  imageUrl!: string;

  @IsOptional()
  @IsString()
  sourceImageUrl?: string;
}
