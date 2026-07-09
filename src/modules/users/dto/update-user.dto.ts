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
  @IsOptional()
  @IsString()
  @MaxLength(12)
  nickname?: string;

  @IsOptional()
  @IsIn(AVATAR_IDS)
  avatarId?: string;
}
