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
  @IsOptional() @IsString() JWT_ACCESS_EXPIRES_IN?: string;
  @IsOptional() @IsString() JWT_REFRESH_EXPIRES_IN?: string;

  @IsOptional() @IsString() WX_APPID?: string;
  @IsOptional() @IsString() WX_SECRET?: string;

  // 阿里云短信（Web 手机号登录）；不填则短信服务走开发降级
  @IsOptional() @IsString() SMS_ACCESS_KEY_ID?: string;
  @IsOptional() @IsString() SMS_ACCESS_KEY_SECRET?: string;
  @IsOptional() @IsString() SMS_ENDPOINT?: string;
  @IsOptional() @IsString() SMS_SIGN_NAME?: string;
  @IsOptional() @IsString() SMS_TEMPLATE_CODE?: string;

  @IsOptional() @IsIn(['relay', 'mock']) AI_PROVIDER?: string;
  // 旧的单中转站变量（保留兼容，会作为 atlas 主用的回退）
  @IsOptional() @IsString() AI_BASE_URL?: string;
  @IsOptional() @IsString() AI_API_KEY?: string;
  // 主用中转站：Atlas Cloud
  @IsOptional() @IsString() AI_ATLAS_BASE_URL?: string;
  @IsOptional() @IsString() AI_ATLAS_API_KEY?: string;
  // 备用中转站：TokenLab
  @IsOptional() @IsString() AI_TOKENLAB_BASE_URL?: string;
  @IsOptional() @IsString() AI_TOKENLAB_API_KEY?: string;

  @IsOptional() @IsIn(['oss', 'minio']) STORAGE_PROVIDER?: string;

  // Web 端 CORS 白名单 + httpOnly Cookie
  @IsOptional() @IsString() CORS_ORIGINS?: string;
  @IsOptional() @IsString() COOKIE_DOMAIN?: string;
  @IsOptional() @IsIn(['lax', 'strict', 'none']) COOKIE_SAMESITE?: string;
  @IsOptional() @IsIn(['true', 'false']) COOKIE_SECURE?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      '环境变量校验失败:\n' + errors.map((e) => e.toString()).join('\n'),
    );
  }
  return validated;
}
