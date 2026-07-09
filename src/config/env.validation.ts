import { plainToInstance } from 'class-transformer';
import { IsIn, IsOptional, IsString, validateSync } from 'class-validator';

/** 启动期环境变量校验：缺失关键项则 fail-fast */
class EnvironmentVariables {
  @IsOptional() @IsString() NODE_ENV?: string;
  @IsOptional() @IsString() PORT?: string;

  @IsString() DATABASE_URL!: string;
  @IsString() REDIS_URL!: string;
  @IsString() JWT_SECRET!: string;
  @IsOptional() @IsString() JWT_EXPIRES_IN?: string;

  @IsOptional() @IsString() WX_APPID?: string;
  @IsOptional() @IsString() WX_SECRET?: string;

  @IsOptional() @IsIn(['relay', 'mock']) AI_PROVIDER?: string;
  @IsOptional() @IsString() AI_BASE_URL?: string;
  @IsOptional() @IsString() AI_API_KEY?: string;

  @IsOptional() @IsIn(['oss', 'minio']) STORAGE_PROVIDER?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error('环境变量校验失败:\n' + errors.map((e) => e.toString()).join('\n'));
  }
  return validated;
}
