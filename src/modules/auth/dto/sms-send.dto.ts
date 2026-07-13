import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class SmsSendDto {
  @ApiProperty({
    description: '手机号（中国大陆 11 位）',
    example: '13800138000',
  })
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式不正确' })
  phone!: string;
}
