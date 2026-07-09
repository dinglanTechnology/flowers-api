import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: '登录/刷新时下发的 refreshToken',
    example: 'v4d9Qb2...base64url',
  })
  @IsString()
  refreshToken!: string;
}
