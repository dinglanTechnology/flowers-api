import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WechatLoginDto {
  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  nickname?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
