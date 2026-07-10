# 插了个花 · 业务后端架构与技术方案

> 微信小程序「插了个花」的业务后端服务。技术栈 NestJS + PostgreSQL + Redis，
> AI 能力对接第三方 OpenAI 兼容中转站，图片存储阿里云 OSS。

---

## 1. 背景与定位

- **客户端**：微信小程序（花材 SVG 渲染、手势编辑、Canvas 导出全部在小程序端完成）。
- **`docs/index.html`**：设计原型 / 渲染参考，不是生产前端；后端**不做任何花朵渲染**。
- **后端职责**：身份认证、业务数据持久化（作品 / 广场 / 日历 / 资料 / 自定义花材）、AI 能力代理（真实图生成 image2、抠图 cutout）、对象存储。
- 后端存储的是插花**数据模型**（`arrangement` JSON：`items[]` 每项含 `assetId / x / y / size / rotation / opacity / mirrored / z / morph / colorVariant / lengthScale …`），视觉渲染由小程序端负责。

## 2. 决策总览（已锁定）

| 维度 | 决策 | 说明 |
|---|---|---|
| 框架 | NestJS 10 + TypeScript | |
| 数据库 | **PostgreSQL + Prisma** | 关系 + JSONB，兼顾强关系与灵活快照 |
| 缓存/队列 | Redis + BullMQ | 把同步 AI 大请求异步化 |
| 登录 | **微信小程序** `code2session` + JWT | openid/unionid 建号 |
| AI 服务 | **第三方 OpenAI 兼容中转站**，可插拔 `AiProvider` | 同步上游，队列包装成异步 |
| 图片存储 | **阿里云 OSS**，可插拔 `StorageProvider`（本地 MinIO） | DB 只存 URL |
| 后端范围 | 第一圈 MVP + 第二圈广场（含内容审核） | 见 §12 |

## 3. 数据库选型理由（按场景）

| 功能场景 | 数据特征 | 为何 PostgreSQL 合适 |
|---|---|---|
| 用户资料 | openid 唯一、字段固定 | 唯一索引 |
| 作品 arrangement | 嵌套、不定长 `items[]`、schema 会演进 | **JSONB** 存快照，可建 GIN 索引 |
| 创作日历 | 按 `userId + dateKey` 分组计数 | B-Tree 索引 + 聚合查询高效 |
| 广场 feed | 游标分页、时间排序、点赞计数 | 关系 + 排序 + 事务，强一致 |
| 自定义花材 | 字段固定 + 图 URL + 归属 | 外键 + 归属约束 |
| AI 任务 | status/progress 状态机、频繁更新 | 行级更新 |

**结论**：项目同时存在**强关系**（广场分页/点赞事务/归属校验、日历聚合）与**灵活嵌套 JSON**（arrangement）。PostgreSQL 的「关系 + JSONB」两头通吃，优于 MongoDB（社交一致性）与 MySQL（JSON 能力）。

## 4. 总体架构

```
微信小程序 (SVG渲染 / 手势 / Canvas导出)
        │  HTTPS + JWT(Authorization)
        ▼
┌──────────────────────────────────────────────┐
│                  NestJS API                    │
│  Global prefix: /api                            │
│  Auth │ Users │ Works │ Plaza │ Materials │ AI │ Upload │
│  ── Guards / ValidationPipe / Interceptor / ExceptionFilter │
└──────┬──────────────┬───────────────┬──────────┘
       │              │               │
       ▼              ▼               ▼
  PostgreSQL      Redis+BullMQ    Provider 适配层
  (Prisma)        (AI异步任务)    ├ AiProvider   → OpenAI兼容中转站
                                  └ StorageProvider → 阿里OSS/MinIO
                                  外部: 微信 code2session / 内容安全审核
```

## 5. 技术栈清单

| 层 | 选型 |
|---|---|
| 框架 | NestJS 10 |
| ORM | Prisma + PostgreSQL |
| 鉴权 | `@nestjs/jwt` + 自定义 `JwtAuthGuard` |
| 校验 | `class-validator` / `class-transformer`（全局 `ValidationPipe`） |
| 队列 | `@nestjs/bullmq` + Redis |
| 配置 | `@nestjs/config` + env schema 校验 |
| 限流 | `@nestjs/throttler`（AI 接口重点保护） |
| 文档 | `@nestjs/swagger`（`/api/docs`） |
| 日志 | `nestjs-pino` |
| AI 客户端 | `openai` SDK（指向中转站 baseURL） |
| 存储 | `ali-oss`（生产）/ MinIO（本地） |
| HTTP | `axios`（微信接口、下载生成图） |

## 6. 目录结构

```
src/
├─ main.ts                      # prefix=api, ValidationPipe, CORS, Swagger, pino
├─ app.module.ts
├─ config/
│  ├─ configuration.ts          # 集中读取 env
│  └─ env.validation.ts         # 启动期校验必填 env
├─ common/
│  ├─ guards/jwt-auth.guard.ts
│  ├─ decorators/current-user.decorator.ts   # @CurrentUser()
│  ├─ decorators/public.decorator.ts         # @Public() 跳过鉴权
│  ├─ interceptors/transform.interceptor.ts  # 统一 {code,data,msg}
│  ├─ filters/all-exceptions.filter.ts
│  └─ dto/pagination.dto.ts
├─ prisma/
│  ├─ prisma.module.ts
│  └─ prisma.service.ts
├─ modules/
│  ├─ auth/
│  │  ├─ auth.controller.ts     # POST /auth/wechat/login
│  │  ├─ auth.service.ts        # 建/找User + 签JWT
│  │  └─ wechat.service.ts      # code2session 封装
│  ├─ users/                    # GET/PATCH /users/me
│  ├─ works/                    # 作品CRUD + 日历聚合
│  ├─ plaza/                    # 广场分享/浏览（含内容审核）
│  ├─ materials/                # 自定义花材（依赖cutout产物）
│  ├─ upload/                   # 原图上传 → OSS
│  └─ ai/
│     ├─ ai.controller.ts       # image2 / cutout-flower 提交+查询
│     ├─ ai.service.ts          # 建AiTask + 入队 + 读task
│     ├─ ai.processor.ts        # BullMQ worker：调provider→存OSS→更新task
│     └─ providers/
│        ├─ ai-provider.interface.ts
│        ├─ relay.provider.ts   # OpenAI兼容中转站实现
│        └─ mock.provider.ts    # 本地开发免外部API
├─ storage/
│  ├─ storage.interface.ts
│  ├─ oss.storage.ts
│  └─ minio.storage.ts
├─ wechat/
│  └─ wechat-security.service.ts  # imgSecCheck / msgSecCheck 内容审核
prisma/schema.prisma
docker-compose.yml               # postgres + redis + minio
.env.example
```

## 7. 数据模型（Prisma）

```prisma
model User {
  id        String   @id @default(cuid())
  openid    String   @unique
  unionid   String?
  nickname  String   @default("")
  avatarId  String   @default("lotus")
  avatarUrl String?
  works     Work[]
  posts     PlazaPost[]
  materials CustomMaterial[]
  aiTasks   AiTask[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Work {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  title        String   @default("今日花事")
  theme        String   @default("night")
  vaseId       String
  arrangement  Json     // 插花快照 { items[], theme, vaseId, ... }
  thumbnailUrl String?
  dateKey      String   // "2026-07-08"，用于日历聚合
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId, dateKey])
  @@index([userId, createdAt])
}

model PlazaPost {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  authorName   String   // 冗余快照，改名不影响历史
  title        String
  theme        String
  arrangement  Json     // 支持"点开继续编辑"
  thumbnailUrl String?
  likeCount    Int      @default(0)
  auditStatus  String   @default("pending") // pending|approved|rejected
  createdAt    DateTime @default(now())

  @@index([auditStatus, createdAt])
}

model CustomMaterial {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  name           String
  category       String   // flower | greenery | line
  baseMaterialId String
  baseKind       String?
  imageUrl       String   // 透明底成品
  sourceImageUrl String?  // 上传原图
  createdAt      DateTime @default(now())

  @@index([userId, createdAt])
}

model AiTask {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  type           String   // image2 | cutout
  status         String   @default("pending") // pending|running|succeeded|failed
  progress       Int      @default(0)
  prompt         String?
  inputImageUrl  String?  // 参考图/原图（大图存OSS，DB存URL）
  resultUrl      String?
  error          String?
  meta           Json?    // size / baseMaterialId / category 等
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId, createdAt])
}
```

> 创作日历不建独立表：`GET /works?month=` 按 `dateKey` 聚合即可。

## 8. 接口清单（全部前缀 `/api`）

统一响应包裹：`{ code: 0, data: <T>, msg: "ok" }`（AI 查询接口为兼容前端多字段解析，`data` 内直接平铺 `imageUrl/status/progress`）。

| 模块 | 方法 & 路径 | 入参 | 返回 |
|---|---|---|---|
| Auth | `POST /auth/wechat/login` | `{ code, nickname?, avatarUrl? }` | `{ accessToken, user }` |
| Users | `GET /users/me` | — | `User` |
| | `PATCH /users/me` | `{ nickname?, avatarId? }` | `User` |
| Works | `GET /works?month=YYYY-MM` | — | `{ [dateKey]: Work[] }` 或列表 |
| | `GET /works/:id` | — | `Work` |
| | `POST /works` | `{ title, theme, vaseId, arrangement, thumbnail?, dateKey }` | `Work` |
| | `PATCH /works/:id` | 同上（部分） | `Work` |
| | `DELETE /works/:id` | — | `{ ok: true }` |
| Plaza | `GET /plaza?page=&size=` | — | `{ items: PlazaPost[], total, page, size }` |
| | `POST /plaza` | `{ workId }` 或 `{ title, theme, arrangement, thumbnail }` | `PlazaPost`（送审后 pending） |
| | `GET /plaza/:id` | — | `PlazaPost` |
| Materials | `GET /materials/custom` | — | `CustomMaterial[]` |
| | `POST /materials/custom` | `{ name, category, baseMaterialId, imageUrl }` | `CustomMaterial` |
| | `DELETE /materials/custom/:id` | — | `{ ok: true }` |
| Upload | `POST /upload/signature` `{ scene, ext? }` | — | OSS 直传签名（客户端直传，推荐） |
| | `POST /upload`（multipart 或 `{ dataUrl }`） | 图片 | `{ url }`（服务端代传兜底） |
| **AI** | `POST /image2` | `{ prompt, referenceImage(dataURL), size }` | `{ taskId, status:"pending", progress }` |
| | `GET /image2/:taskId` | — | `{ status, progress, imageUrl }` |
| | `POST /cutout-flower` | `{ category, name, sourceImageUrl }`（prompt 等后端内置） | `{ taskId, status:"pending", progress }` |
| | `GET /cutout-flower/:taskId` | — | `{ status, progress, image:imageUrl }` |

> **字段与小程序端严格对齐**：前端 `image2TaskId()` 读 `taskId/id/task_id`；`image2ResultSrc()/cutoutResultSrc()` 读 `imageUrl/url/image/imageData/base64/images[0].url…`。后端 GET 成功态统一返回 `imageUrl`（cutout 额外给 `image` 别名），前端无需改动。

## 9. 核心流程

### 9.1 微信登录

```
小程序 wx.login() → code
POST /api/auth/wechat/login { code, nickname?, avatarUrl? }
  → wechat.service: GET code2session(appid,secret,js_code) → { openid, unionid, session_key }
  → upsert User(openid)；若带 nickname/avatarUrl 则更新
  → 签发 JWT(sub=user.id) → { accessToken, user }
```
- `session_key` 仅服务端持有，**绝不下发**（仅内容审核/解密需要时用）。
- 头像/昵称走小程序端 `getUserProfile` 采集后随登录上报。

### 9.2 AI 任务流（中转站同步 → 队列异步包装）

中转站是 **OpenAI 兼容的同步接口**（阻塞 10~30s 直接返图），用自建队列包装成前端期望的「提交→轮询」：

```
POST /api/image2
  1. JwtGuard + Throttler(限流控成本)
  2. referenceImage(dataURL) 落 OSS → inputImageUrl
  3. 建 AiTask(pending) → 入 BullMQ → 立即返回 { taskId }

BullMQ worker (ai.processor):
  4. status=running，progress 合成爬坡（黑盒无真实进度）
  5. AiProvider.image2({prompt,image}) 调中转站(同步~20s)
  6. 拿到成品图 → StorageProvider.put() → OSS url
  7. AiTask(succeeded, resultUrl, progress=100)  失败则 (failed, error)

GET /api/image2/:taskId → 读 AiTask 返回 { status, progress, imageUrl }
```
- cutout 流程同构：`AiProvider.cutout({image})` → 透明底 PNG → OSS → task。
- **进度是合成的**（pending 0 → running 匀速爬到 ~90 → 完成 100），前端进度条无需改。

### 9.3 作品与日历

- 保存/导出时 `POST /works`，`dateKey` 由客户端按本地时区生成。
- 日历 `GET /works?month=` 服务端按 `dateKey` 分组返回，客户端渲染每日数量。

### 9.4 广场与内容审核（UGC 合规）

```
POST /plaza → 先调 微信 imgSecCheck(缩略图) + msgSecCheck(标题)
  → 通过: auditStatus=approved 入 feed
  → 不通过: auditStatus=rejected，返回提示
GET /plaza 只返回 approved
```
> 微信小程序 UGC **强制内容审核**，否则无法过审上线。

## 10. AI 适配层设计（可插拔）

```ts
// ai-provider.interface.ts
export interface AiProvider {
  image2(input: { prompt: string; image?: string }): Promise<Buffer>; // 同步出图
  cutout(input: { image: string }): Promise<Buffer>;                  // 透明底PNG
}
```

- `relay.provider.ts`：用 `openai` SDK 指向中转站 `baseURL`，`/v1/images/generations`（文生图）或 `/v1/images/edits`（图生图，带 referenceImage）。
- **cutout 两种落地**（取决于中转站能力，待确认）：
  - 中转站有图像编辑模型 → `images/edits` + prompt「移除背景、输出透明底 PNG」；
  - 中转站无抠图 → 单独接抠图服务（remove.bg / 阿里图像分割 / 自建 rembg），实现与 image2 解耦。
- `mock.provider.ts`：本地开发返回占位图，免调外部、免烧钱。
- 通过 `AI_PROVIDER` env 切换实现，业务代码不感知厂商。

## 11. 存储适配层

```ts
export interface StorageProvider {
  put(key: string, buf: Buffer, contentType: string): Promise<string>;      // 服务端直传，返回URL
  createUploadSignature?(input: UploadSignatureInput): Promise<UploadSignature>; // 客户端直传签名
}
```
- 生产 `oss.storage.ts`（`ali-oss`），本地 `minio.storage.ts`。
- **客户端大图直传**：`POST /api/upload/signature` 签发 OSS PostObject 策略签名 → 小程序 `wx.uploadFile` 直传 → 业务接口收 URL（cutout 收 `sourceImageUrl`、image2 收 `referenceImageUrl`），后端不中转图片流量。
- **服务端直传**：AI 结果图由 worker `put()` 落 OSS。
- Key 规范：`ai/image2/{taskId}.png`、`ai/cutout/{taskId}.png`、`upload/{scene}/{userId}/{uuid}.png`、`thumb/{workId}.png`。
- DB 仅存最终 URL；建议 OSS 挂 CDN。

## 12. 后端范围（分圈交付）

**🟢 第一圈（MVP）**：Auth（微信登录）、Users、Works（+日历）、Materials（自定义花材）、AI（image2/cutout + OSS + 队列）、Upload。→ 闭环单人创作体验。

**🟡 第二圈**：Plaza 广场（分享/游标分页/点开编辑/点赞）+ **微信内容审核**（与广场同步做）。

**🔴 暂不做**：评论/关注/私信等重社交、消息推送、运营后台、多端。

## 13. 安全与工程约束

- **HTTPS 必须**（小程序 request 合法域名要求）；在小程序后台配置 request 合法域名。
- **鉴权**：除 `@Public()`（登录接口）外全局 `JwtAuthGuard`；Works/Materials 做**归属校验**（只能操作自己的）。
- **限流**：AI 接口 `@Throttler` + 每用户每日配额，防刷控成本；cutout 上传校验图片大小/类型。
- **统一响应/异常**：`TransformInterceptor` + `AllExceptionsFilter`。
- **配置校验**：启动期校验必填 env，缺失即 fail-fast。
- **密钥**：微信 secret / 中转站 key / OSS key / JWT secret 全走环境变量，不入库不入码。

## 14. 环境变量（`.env.example`）

```dotenv
# 服务
PORT=3000
NODE_ENV=development

# 数据库 / Redis
DATABASE_URL=postgresql://flower:flower@localhost:5432/flower?schema=public
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=change_me
JWT_EXPIRES_IN=30d

# 微信小程序
WX_APPID=
WX_SECRET=

# AI 中转站（OpenAI 兼容）
AI_PROVIDER=relay            # relay | mock
AI_BASE_URL=https://your-relay.example.com/v1
AI_API_KEY=
AI_IMAGE2_MODEL=gpt-image-1  # 按中转站支持的模型填
AI_CUTOUT_MODEL=             # 抠图模型/服务；若单独接则另配

# 存储
STORAGE_PROVIDER=oss         # oss | minio
OSS_REGION=oss-cn-hangzhou
OSS_BUCKET=
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_CDN_BASE=                # 可选，CDN 域名
```

## 15. 本地开发与部署

- **本地**：`docker-compose up`（postgres + redis + minio）→ `pnpm prisma migrate dev` → `pnpm start:dev`；`AI_PROVIDER=mock` 免外部依赖联调。
- **生产**：Docker 镜像 + `docker-compose`（或 K8s）；Nginx 反代 + HTTPS 证书；`prisma migrate deploy`；进程含 API 与 BullMQ worker（可同进程或拆独立 worker 进程）。
- **CI**：lint → test → build 镜像 → 部署。

## 16. 分阶段开发计划

| 阶段 | 内容 | 交付标志 |
|---|---|---|
| **P0 脚手架** | `nest new`、Prisma、docker-compose、config/公共层、Swagger | 空服务可跑，`/api/docs` 可访问 |
| **P1 鉴权** | 微信 code2session + JWT + Guard/装饰器 | 小程序能登录拿 token |
| **P2 资料** | Users me 读写 | 资料页打通 |
| **P3 作品+日历** | Works CRUD + 月度聚合 | 保存/加载/日历 |
| **P5 AI+存储** | StorageProvider + AiProvider(中转站) + BullMQ + image2/cutout | 真实图 & 抠图跑通 |
| **P6 自定义花材** | Materials（依赖 cutout） | 花材库落后端 |
| **P4 广场** | Plaza 分享/分页 + 内容审核 | 多人共享（第二圈） |
| **P7 加固上线** | 限流/日志/异常/配额 + 部署 CI | 生产可用 |

依赖顺序：`P0 → P1 →(P2/P3 并行)→ P5 → P6 →（P4 广场）→ P7`。

## 17. 待确认事项

1. **中转站抠图能力**：是否支持图像编辑（用于 cutout），还是需要单独接抠图服务？决定 `AiProvider.cutout` 的实现。
2. 中转站可用的**图像模型名**（填入 `AI_IMAGE2_MODEL`）及是否支持图生图（`images/edits` 带参考图）。
3. 运维是否已有 PostgreSQL/Redis 实例，或需 docker-compose 自带。
