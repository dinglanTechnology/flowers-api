// 两个模型在各平台的默认 ID（协议不同、命名也不同，可用 AI_<NAME>_*_MODEL 覆盖）
// Atlas：自研接口，模型名带 action 后缀
// 抠图用专用去背模型（出真透明 PNG）；生图/编辑类模型返回压平图，不适合抠图
const ATLAS_IMAGE2_MODEL = 'openai/gpt-image-2/edit';
const ATLAS_CUTOUT_MODEL = 'youchuan/v8.1/remove-background';
// TokenLab：OpenAI 兼容，模型名为裸名
const TOKENLAB_IMAGE2_MODEL = 'gpt-image-2';
// cutout 走 OpenAI images.edit；nano-banana-2 当前不支持 image-edit 操作。
const TOKENLAB_CUTOUT_MODEL = 'gpt-image-2';

/** 集中读取环境变量，供 ConfigService 按路径取用（如 config.get('jwt.secret')） */
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change_me',
    // 客户端暂未实现刷新逻辑，access 过期即需重登，故默认拉长
    // 兼容旧变量：JWT_EXPIRES_IN 作为 access 有效期的回退
    accessExpiresIn:
      process.env.JWT_ACCESS_EXPIRES_IN ?? process.env.JWT_EXPIRES_IN ?? '30d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '90d',
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  wechat: {
    appId: process.env.WX_APPID ?? '',
    secret: process.env.WX_SECRET ?? '',
  },
  ai: {
    provider: process.env.AI_PROVIDER ?? 'mock',
    // 单次上游请求超时（ms）：超时即失败，避免任务永远卡在 running，并让故障转移能切备用。
    timeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '120000', 10),
    // 单个任务整体处理超时（ms）：兜底 provider 之外的挂起（OSS 上传 / DB），应大于 timeoutMs×上游数。
    jobTimeoutMs: parseInt(process.env.AI_JOB_TIMEOUT_MS ?? '300000', 10),
    // 任务尝试次数（1=不重试）。注意：重试会重新调用上游，可能重复计费，按需调小。
    attempts: parseInt(process.env.AI_JOB_ATTEMPTS ?? '2', 10),
    // 主/备中转站：数组顺序即故障转移优先级（atlas 主用 → tokenlab 备用）。
    // 每个上游带 protocol：atlas=自研接口，openai=OpenAI 兼容（TokenLab）。
    // 模型 ID 分平台配置：默认按各自协议命名，可用 AI_<NAME>_*_MODEL 覆盖。
    // 只有同时填了 baseUrl + apiKey 的上游才会被启用。
    upstreams: [
      {
        name: 'atlas',
        protocol: 'atlas',
        baseUrl:
          process.env.AI_ATLAS_BASE_URL ??
          process.env.AI_BASE_URL ??
          'https://api.atlascloud.ai/api/v1',
        apiKey: process.env.AI_ATLAS_API_KEY ?? process.env.AI_API_KEY ?? '',
        image2Model: process.env.AI_ATLAS_IMAGE2_MODEL ?? ATLAS_IMAGE2_MODEL,
        cutoutModel: process.env.AI_ATLAS_CUTOUT_MODEL ?? ATLAS_CUTOUT_MODEL,
        timeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '120000', 10),
        // 默认异步提交+轮询，避免慢生图的长连接被中间层 60s 超时掐断（UND_ERR_SOCKET）。
        // 仅在确认上游同步稳定时才 AI_ATLAS_SYNC_MODE=true 切回同步。
        syncMode: process.env.AI_ATLAS_SYNC_MODE === 'true',
        // 默认 worker 侧把图内联成 dataURL 再提交，绕开 atlas 服务端 rehost，
        // 让私有 OSS / 403 源图也能用。AI_ATLAS_INLINE_IMAGE=false 可关闭。
        inlineImages: process.env.AI_ATLAS_INLINE_IMAGE !== 'false',
      },
      {
        name: 'tokenlab',
        protocol: 'openai',
        baseUrl:
          process.env.AI_TOKENLAB_BASE_URL ?? 'https://api.tokenlab.sh/v1',
        apiKey: process.env.AI_TOKENLAB_API_KEY ?? '',
        image2Model:
          process.env.AI_TOKENLAB_IMAGE2_MODEL ?? TOKENLAB_IMAGE2_MODEL,
        cutoutModel:
          process.env.AI_TOKENLAB_CUTOUT_MODEL ?? TOKENLAB_CUTOUT_MODEL,
        timeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '120000', 10),
      },
    ].filter((u) => u.apiKey),
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
