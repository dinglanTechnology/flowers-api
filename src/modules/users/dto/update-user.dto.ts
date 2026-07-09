import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const AVATAR_IDS = [
  'lotus',
  'orchid',
  'sun',
  'leaf',
  'rose',
  'moon',
  'tea',
  'ink',
];

export class UpdateUserDto {
  @ApiProperty({
    required: false,
    maxLength: 12,
    description: '昵称（≤12 字，过微信文本审核）',
    example: '一枝春',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  nickname?: string;

  @ApiProperty({
    required: false,
    enum: AVATAR_IDS,
    description: '头像预设 id（见 GET /config/bootstrap 的 avatars）',
    example: 'lotus',
  })
  @IsOptional()
  @IsIn(AVATAR_IDS)
  avatarId?: string;
}
