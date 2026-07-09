/** 集中读取环境变量，供 ConfigService 按路径取用（如 config.get('jwt.secret')） */
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change_me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  wechat: {
    appId: process.env.WX_APPID ?? '',
    secret: process.env.WX_SECRET ?? '',
  },
  ai: {
    provider: process.env.AI_PROVIDER ?? 'mock',
    baseUrl: process.env.AI_BASE_URL ?? '',
    apiKey: process.env.AI_API_KEY ?? '',
    image2Model: process.env.AI_IMAGE2_MODEL ?? '',
    cutoutModel: process.env.AI_CUTOUT_MODEL ?? '',
  },
  storage: {
    provider: process.env.STORAGE_PROVIDER ?? 'minio',
    oss: {
      region: process.env.OSS_REGION ?? '',
      bucket: process.env.OSS_BUCKET ?? '',
      accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? '',
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET ?? '',
      endpoint: process.env.OSS_ENDPOINT ?? '',
      cdnBase: process.env.OSS_CDN_BASE ?? '',
    },
  },
});
