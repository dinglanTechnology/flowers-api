import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const THEMES = ['night', 'light', 'morning', 'rouge', 'gallery', 'onyx'];

export class CreateWorkDto {
  @IsString()
  @MaxLength(18)
  title!: string;

  @IsIn(THEMES)
  theme!: string;

  @IsString()
  vaseId!: string;

  @IsObject()
  arrangement!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  thumbnail?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateKey 需为 YYYY-MM-DD' })
  dateKey!: string;
}
