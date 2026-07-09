import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WechatLoginDto {
  @IsString()
  code!: string;

  /** getPhoneNumber 返回的 code，传了则一并换取并绑定手机号 */
  @IsOptional()
  @IsString()
  phoneCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  nickname?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
