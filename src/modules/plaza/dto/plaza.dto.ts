import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const THEMES = ['night', 'light', 'morning', 'rouge', 'gallery', 'onyx'];

export class PlazaFeedDto extends PaginationDto {}

export class SharePlazaDto {
  /** 由已有作品分享 */
  @IsOptional()
  @IsString()
  workId?: string;

  /** 或直接提供作品信息 */
  @IsOptional()
  @IsString()
  @MaxLength(18)
  title?: string;

  @IsOptional()
  @IsIn(THEMES)
  theme?: string;

  @IsOptional()
  @IsObject()
  arrangement?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  thumbnail?: string;
}
