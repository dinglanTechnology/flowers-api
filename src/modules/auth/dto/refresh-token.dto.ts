import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    required: false,
    description:
      '登录/刷新时下发的 refreshToken。小程序在 body 传；Web 端走 httpOnly Cookie，可不传。',
    example: 'v4d9Qb2...base64url',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
