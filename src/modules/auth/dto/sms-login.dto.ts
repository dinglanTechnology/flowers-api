import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SmsLoginDto {
  @ApiProperty({
    description: '手机号（中国大陆 11 位）',
    example: '13800138000',
  })
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;

  @ApiProperty({ description: '6 位短信验证码', example: '123456' })
  @Matches(/^\d{6}$/, { message: '验证码格式不正确' })
  code!: string;

  @ApiProperty({
    required: false,
    maxLength: 12,
    description: '昵称（首次注册可带）',
    example: '花间一壶酒',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  nickname?: string;
}
