import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WechatLoginDto {
  @ApiProperty({
    description: 'wx.login 拿到的临时登录 code',
    example: '081Kv0Ga1abcXY0Rit...',
  })
  @IsString()
  code!: string;

  @ApiProperty({
    required: false,
    description: 'getPhoneNumber 返回的 code；传了则换取并绑定手机号',
    example: 'e8f3...phone-code',
  })
  @IsOptional()
  @IsString()
  phoneCode?: string;

  @ApiProperty({
    required: false,
    maxLength: 12,
    description: '昵称（微信头像昵称填写能力获取）',
    example: '花间一壶酒',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  nickname?: string;

  @ApiProperty({
    required: false,
    description: '头像 URL（chooseAvatar 上传 OSS 后的地址）',
    example: 'https://flower-prod.oss-cn-chengdu.aliyuncs.com/avatar/xxx.png',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
