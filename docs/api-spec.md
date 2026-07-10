# 插了个花 · 接口规范（API Spec）

> 微信小程序「插了个花」业务后端接口清单与数据结构定义。
> 配套架构见 [`architecture.md`](architecture.md)。字段与小程序端 `docs/index.html` 现有数据结构对齐。

---

## 1. 全局约定

### 1.1 基础

| 项 | 约定 |
|---|---|
| Base URL | `/api` |
| 协议 | HTTPS（小程序要求） |
| 编码 | UTF-8，`Content-Type: application/json`（上传除外） |
| 鉴权 | `Authorization: Bearer <JWT>`（除标 🔓 外均需登录） |
| 时间 | ISO 8601 字符串（如 `2026-07-08T09:30:00.000Z`） |

### 1.2 统一响应包裹

成功：`{ "code": 0, "data": { }, "msg": "ok" }`
失败：`{ "code": 401, "data": null, "msg": "令牌无效或已过期" }`

> AI 任务查询接口（#16/#18）为兼容前端多字段解析，`data` 内直接平铺 `imageUrl / image / status / progress`。

### 1.3 错误码

| code | 含义 | 场景 |
|---|---|---|
| 0 | 成功 | — |
| 400 | 参数错误 | 校验失败 / 内容审核不通过 |
| 401 | 未认证 | 缺失/失效 token |
| 403 | 无权限 | 操作非本人资源 |
| 404 | 不存在 | 资源未找到 |
| 429 | 请求过频 | 限流（AI 接口） |
| 500 | 服务器错误 | 未捕获异常 |

### 1.4 分页（page/size）

请求：`?page=1&size=20`（`page` 从 1 开始，默认 1；`size` 1–50，默认 20）
响应：`{ items: T[], total: number, page: number, size: number }`（`total` 为总条数）

---

## 2. 数据对象 Schema

### 2.1 枚举

```ts
type Theme = 'night' | 'light' | 'morning' | 'rouge' | 'gallery' | 'onyx';
type MaterialCategory = 'flower' | 'greenery' | 'line';        // 花器用 vaseId 单独表达
type AvatarId = 'lotus' | 'orchid' | 'sun' | 'leaf' | 'rose' | 'moon' | 'tea' | 'ink';
type ColorVariant = 'original' | 'rose' | 'sun' | 'violet' | 'leaf';
type AiTaskType = 'image2' | 'cutout';
type AiTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed';
type AuditStatus = 'pending' | 'approved' | 'rejected';
type UploadScene = 'cutout-source' | 'export-reference' | 'work-thumbnail' | 'general';
```

### 2.2 ArrangementItem（画布上的单个花材）

```ts
interface ArrangementItem {
  uid: string;              // 画布内唯一 id
  assetId: string;         // 花材 id，如 "mat-rose"；自定义花材为其记录 id
  x: number;               // 水平位置 %（0–100）
  y: number;               // 垂直位置 %（0–100）
  size: number;            // 相对尺寸 %（约 8–40）
  rotation: number;        // 旋转角度（度）
  opacity: number;         // 不透明度（0–100）
  mirrored: boolean;       // 是否水平镜像
  z: number;               // 图层顺序（越大越上层）
  colorVariant: ColorVariant;
  morph: string;           // 形态，如 "full" / "lotus-tall" / "cascade"
  lengthScale: number;     // 长度缩放 %（约 76–138）
  trim?: number;           // 裁剪 %（默认 100）
  branchLength?: number;   // 枝条长度（枝叶/线条类）
}
```

### 2.3 Arrangement（插花快照）

```ts
interface Arrangement {
  title?: string;
  theme: Theme;
  vaseId: string;          // 花器 id，如 "mat-vase-ink"
  selectedId: string | null;
  items: ArrangementItem[];
}
```

### 2.4 User

```ts
interface User {
  id: string;
  nickname: string;
  avatarId: AvatarId;
  avatarUrl: string | null;
  phone: string | null;    // 新版 getuserphonenumber 绑定，未绑为 null
  createdAt: string;
}
// openid / unionid / sessionKey 为服务端内部字段，绝不下发
```

### 2.5 Work（作品）

```ts
interface Work {
  id: string;
  userId: string;
  title: string;           // 默认 "今日花事"
  theme: Theme;
  vaseId: string;
  arrangement: Arrangement;
  thumbnailUrl: string | null;
  dateKey: string;         // "2026-07-08"，日历聚合键（客户端本地时区生成）
  createdAt: string;
  updatedAt: string;
}
```

### 2.6 PlazaPost（广场作品）

```ts
interface PlazaPost {
  id: string;
  userId: string;
  authorName: string;      // 冗余快照，作者改名不影响历史
  title: string;
  theme: Theme;
  arrangement: Arrangement;
  thumbnailUrl: string | null;
  likeCount: number;
  liked: boolean;           // 当前登录用户是否已赞
  auditStatus: AuditStatus; // feed 仅返回 approved
  createdAt: string;
}
```

### 2.7 CustomMaterial（自定义花材）

```ts
interface CustomMaterial {
  id: string;
  userId: string;
  name: string;
  category: MaterialCategory;
  baseMaterialId: string;  // 基于哪个内置花材，如 "mat-rose"
  baseKind: string | null; // 基础形态 kind，如 "rose"
  imageUrl: string;        // AI 抠图产出的透明底成品
  sourceImageUrl: string | null; // 上传原图
  createdAt: string;
}
```

### 2.8 BuiltinMaterial（内置素材，图片渲染）

```ts
// 内置素材已改为图片渲染：前端直接贴 imageUrl，多样式素材每款姿态各有独立图。
// 矢量字段（kind/colors/shape/morph/lengthScale）不下发，仅生成 PNG 时用。
interface MaterialStyle {
  styleOption: string;     // 样式预设 id，如 "rose-full-mid"（与作品项 styleOption 对齐）
  name: string;            // "玫瑰盛放"
  imageUrl: string;        // 该姿态的 OSS 透明底 PNG（长度已烘入）
}

interface BuiltinMaterial {
  id: string;              // "mat-rose"，一经发布永不复用/删除；= OSS 文件名
  name: string;            // "玫瑰"
  category: 'flower' | 'greenery' | 'line' | 'vase';
  imageUrl: string | null; // 缩略图/单样式素材的 OSS 透明底 PNG
  styles: MaterialStyle[] | null; // 花/枝/线为 6 款；花器等单样式为 null
}

interface MaterialsCatalog {
  categories: { id: string; label: string }[]; // flower/greenery/line/vase（代码常量）
  materials: BuiltinMaterial[];
}
```

### 2.8b Theme / AvatarOption（客户端配置，`GET /config/bootstrap`）

```ts
interface Theme {
  id: string;              // night/light/morning/rouge/gallery/onyx
  label: string;
  note: string;
  bg: string; panel: string; panel2: string;
  text: string; muted: string; line: string;
  accent: string; accent2: string; danger: string;
  canvas: string; paper: string; shadow: string;
  vase: string[];          // 花器渐变三色
  previewFlower: string[]; // 预览花三色
}

interface AvatarOption {
  id: AvatarId;            // 与 User.avatarId 对齐
  label: string;           // "荷"/"兰"/...
  colors: string[];        // 头像双色
}
```

### 2.9 OssUploadSignature（OSS 直传签名）

```ts
// 服务端签名直传（PostObject Policy），客户端 wx.uploadFile 表单直传
interface OssUploadSignature {
  mode: 'post-policy';
  host: string;           // https://<bucket>.<region>.aliyuncs.com
  key: string;            // 服务端预分配对象 key（含 scene 前缀）
  policy: string;         // base64 编码 policy（含 size / content-type 限制）
  signature: string;
  ossAccessKeyId: string;
  expire: number;         // 过期 Unix 秒
  maxSize: number;        // 允许最大字节
  fileUrl: string;        // 上传成功后的最终 URL（含 CDN）
}
// 备选 STS：{ mode:'sts', region, bucket, accessKeyId, accessKeySecret, securityToken, expiration, keyPrefix }
```

### 2.10 AiTask（AI 异步任务）

```ts
interface AiTask {
  id: string;
  userId: string;
  type: AiTaskType;
  status: AiTaskStatus;
  progress: number;        // 0–100（中转站黑盒，服务端合成爬坡）
  prompt: string | null;
  inputImageUrl: string | null; // 参考图/原图（OSS）
  resultUrl: string | null;     // 成品图（OSS）
  error: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}
```

---

## 3. 接口详情

图例：🔓 公开 · ✅ 需登录 · 阶段 P0–P7

### 3.0 系统 · P0 ✅

#### `GET /api/health` 🔓
响应：`{ status: "ok", service: "flowers-api" }`

---

### 3.1 认证 Auth · P1

#### `POST /api/auth/wechat/login` 🔓
微信小程序登录：`code2session` 换 openid → upsert 用户 → 签发令牌对。传 `phoneCode` 则同步换取并绑定手机号（新版 `getuserphonenumber`，无需解密）。

- 请求：`{ code: string; phoneCode?: string; nickname?: string; avatarUrl?: string }`
- 响应：`{ accessToken: string; refreshToken: string; user: User }`
- 错误：`400` code / phoneCode 无效；微信接口异常

#### `POST /api/auth/refresh` 🔓
用 refresh token 换新令牌对（旧 refresh 立即失效，轮换）。

- 请求：`{ refreshToken: string }`
- 响应：`{ accessToken: string; refreshToken: string }`
- 错误：`401` refresh 无效或已过期

#### `POST /api/auth/logout` 🔓
吊销 refresh token。

- 请求：`{ refreshToken: string }`
- 响应：`{ success: true }`

> 令牌：`accessToken` 为无状态 JWT（默认 `JWT_ACCESS_EXPIRES_IN`）；`refreshToken` 为不透明随机串，sha256 后存 Redis（默认 `JWT_REFRESH_EXPIRES_IN`）。客户端未接刷新逻辑前，两者可同设为长期。

---

### 3.2 用户 Users · P2

#### `GET /api/users/me` ✅
响应：`User`

#### `PATCH /api/users/me` ✅
- 请求：`{ nickname?: string; avatarId?: AvatarId }`（`nickname` ≤ 12 字）
- `nickname` 过微信 `msgSecCheck` 文本审核，不通过 `400`
- 响应：`User`（含 `phone`）

---

### 3.3 内置素材目录 Materials Catalog · P2

#### `GET /api/materials/catalog` 🔓
下发内置素材目录。**分类为代码常量；素材从 `Material` 表读**，支持后台上下架（`active`）/换图/调序（`sortOrder`）而不发版。素材已改为**图片渲染**：前端直接贴 `imageUrl`，多样式素材的每款姿态各有独立 `imageUrl`。

- 响应：`MaterialsCatalog`
  - `materials[]`：`{ id, name, category, imageUrl, styles }`
  - `styles`：花/枝/线为 6 款 `{ styleOption, name, imageUrl }`（长度已烘进图）；花器等单样式素材为 `null`
- 客户端策略：`styles?.length ? 渲染6款 : 单样式`；渲染选择器时与 `GET /materials/custom` 合并
- 图片资源：全部 OSS，key 约定 `default-materials/<category>/<id>.png`（缩略图）、`default-materials/<category>/<id>/<styleOption>.png`（姿态）

> 矢量相关字段（`kind`/`colors`/`shape`/`morph`/`lengthScale`）不再下发——纯图片渲染用不到；它们只在生成 PNG 时用（见 `scripts/materials-svg-to-png.mjs`）。主题/头像预设改由 `GET /config/bootstrap` 下发（见 3.9）。

---

### 3.4 作品 Works + 创作日历 · P3

#### `GET /api/works/calendar?month=YYYY-MM` ✅
按天返回作品数量，供日历角标。
- 响应：`{ [dateKey: string]: number }`

#### `GET /api/works?dateKey=YYYY-MM-DD` ✅
某天作品列表（日历点选某日）。
- 响应：`Work[]`（按 `createdAt` 倒序）

#### `GET /api/works/:id` ✅
- 响应：`Work`；错误 `403`/`404`

#### `POST /api/works` ✅
保存作品（导出/手动保存时）。
- 请求：`{ title, theme, vaseId, arrangement, thumbnail?, dateKey }`
  （`thumbnail` 传 dataURL 则服务端转存 OSS；或传已直传的 URL）
- 响应：`Work`

#### `PATCH /api/works/:id` ✅
- 请求：上述字段任意子集；响应 `Work`；错误 `403`/`404`

#### `DELETE /api/works/:id` ✅
- 响应：`{ ok: true }`；错误 `403`/`404`

---

### 3.5 图片上传 Upload · P5

> **推荐直传流程**：客户端 → `POST /upload/signature` 拿签名 → `wx.uploadFile` 直传 OSS → 得 `fileUrl` → 把 URL 传给业务接口。后端不扛图片流量。`POST /upload` 仅作小图/兜底。

#### `POST /api/upload/signature` ✅ ★推荐
签发 OSS 直传凭证，按 `scene` 预分配 key 并在 policy 限制大小/类型。
- 请求：`{ scene: UploadScene; ext?: string }`
- 响应：`OssUploadSignature`
- 客户端：`wx.uploadFile({ url: host, filePath, name:'file', formData:{ key, OSSAccessKeyId, policy, signature, success_action_status:'200' } })` → 用 `fileUrl`

#### `POST /api/upload` ✅（服务端代传，兜底）
- `multipart/form-data`（字段 `file`）或 JSON `{ dataUrl }`
- 约束：`image/png|jpeg|webp`，≤ 8MB
- 响应：`{ url: string }`；错误 `400`

---

### 3.6 AI 能力 · P5

> 提交→轮询模型。POST 建任务入队立即返 `taskId`；worker 调中转站(同步)→存 OSS→回写任务；GET 轮询。限流：每用户默认 60s ≤ 10 次。

#### `POST /api/image2` ✅
由当前插花生成真实摄影风格图。
- 请求：
```ts
{
  prompt: string;             // 客户端 buildImage2Prompt()
  referenceImageUrl?: string; // 直传 OSS 后的 URL（推荐）
  referenceImage?: string;    // 或导出画布 dataURL（兼容，二选一）
  size?: string;              // 默认 "1024x1536"
}
```
- 响应：`{ taskId, status, progress }`

#### `GET /api/image2/:taskId` ✅
- 响应：`{ status, progress, imageUrl?, error? }`

#### `POST /api/cutout-flower` ✅
上传真实花材照片，AI 抠图生成透明底素材。前端只传 类型 / 花材名 / 照片链接，其余（含 prompt、透明底、去背模型）后端处理。
- 请求：
```ts
{
  category: MaterialCategory;      // 素材类型 flower | greenery | line
  name: string;                    // 花材名（过微信文本审核）
  sourceImageUrl: string;          // 照片链接（直传 OSS 后的 URL）
}
```
- 响应：`{ taskId, status, progress }`

#### `GET /api/cutout-flower/:taskId` ✅
- 响应：`{ status, progress, image?, error? }`（`image` = 透明底图 URL）

---

### 3.7 自定义花材 Custom Materials · P6

#### `GET /api/materials/custom` ✅
- 响应：`CustomMaterial[]`（当前用户，`createdAt` 倒序）

#### `POST /api/materials/custom` ✅
保存 cutout 产物为花材库条目。`name` 过微信 `msgSecCheck` 文本审核，不通过 `400`。
- 请求：`{ name, category, baseMaterialId, baseKind?, imageUrl, sourceImageUrl? }`
- 响应：`CustomMaterial`

#### `DELETE /api/materials/custom/:id` ✅
- 响应：`{ ok: true }`；错误 `403`/`404`

---

### 3.8 分享广场 Plaza · P4（含微信内容审核）

#### `GET /api/plaza?page=&size=` ✅
广场 feed，仅返回 `approved`。每条带 `liked`（当前用户是否已赞，一次批量查询标注）。
- 响应：`{ items: PlazaPost[]; total: number; page: number; size: number }`

#### `POST /api/plaza` ✅
分享作品。标题过微信 `msgSecCheck`（文本）；图片审核当前为放行 stub（见下）。
- 请求：`{ workId }` 或 `{ title, theme, arrangement, thumbnail }`
- 响应：`PlazaPost`（`auditStatus: approved`）
- 错误：`400` 标题审核不通过

#### `GET /api/plaza/:id` ✅
- 响应：`PlazaPost`（含 `liked`，供"点开继续编辑"）

#### `POST /api/plaza/:id/like` ✅
点赞/取消赞（幂等 toggle，按 `PlazaLike` 唯一键去重）。
- 响应：`{ likeCount: number; liked: boolean }`（`liked` = 本次操作后的状态）
- 错误：`404` 作品不存在或未过审

> **内容审核现状**：文本审核（`msgSecCheck`）已接入 Plaza 标题、昵称、自定义素材名。**图片审核（`imgSecCheck` / `media_check_async`）暂不做**——`WechatSecurityService.checkImage` 为放行 stub；`POST /wechat/audit-callback` 异步回调未实现。所有图片直传 OSS，DB 只存 URL。

---

### 3.9 客户端配置 Config · P2

#### `GET /api/config/bootstrap` 🔓
下发前端启动配置：主题 + 头像预设（原写死在前端，现集中下发）。

- 响应：`{ themes: Theme[]; avatars: AvatarOption[] }`
- `Theme`：`{ id, label, note, bg, panel, text, accent, …, vase[], previewFlower[] }`（6 套）
- `AvatarOption`：`{ id, label, colors[] }`（8 个，`id` 与 `User.avatarId` 对齐）

---

## 4. 接口总览

| # | 模块 | 接口 | 阶段 |
|---|---|---|---|
| 1 | 系统 | `GET /health` | P0 ✅ |
| 2–4 | 认证 | `POST /auth/wechat/login`、`POST /auth/refresh`、`POST /auth/logout` | P1 |
| 5–6 | 用户 | `GET/PATCH /users/me` | P2 |
| 7 | 内置素材 | `GET /materials/catalog` | P2 |
| 8 | 客户端配置 | `GET /config/bootstrap`（主题+头像） | P2 |
| 9–14 | 作品+日历 | calendar / list / detail / create / update / delete | P3 |
| 15–16 | 上传 | `POST /upload/signature`、`POST /upload` | P5 |
| 17–20 | AI | image2 提交/查询、cutout 提交/查询 | P5 |
| 21–23 | 自定义花材 | custom list / create / delete | P6 |
| 24–27 | 广场 | feed / share / detail / like（toggle） | P4 |

**已实现接口 27 个。** 图片内容审核（`imgSecCheck` / `POST /wechat/audit-callback`）暂不做。

---

## 5. 素材数据处理约定

项目的"素材"处理方式：

| 类别 | 性质 | 归属 | 后端存储 |
|---|---|---|---|
| 内置花/叶/线/器 + 6 款姿态 | **透明底 PNG** | OSS + DB | `Material.imageUrl` / `styles[].imageUrl` + OSS URL |
| 主题、头像预设 | 配置 | 代码常量 | `bootstrap.data.ts`（`/config/bootstrap` 下发） |
| 自定义花材 | 真实图片 | OSS + DB | `CustomMaterial` + OSS URL |
| 示范广场作品 | 数据 | DB | `PlazaPost` 记录 |
| 作品/广场缩略图 | 光栅图 | OSS | `thumbnailUrl` |

**关键原则**
1. `assetId` / `styleOption` / `theme` / `vaseId` / `avatarId` 一经发布**永不复用或删除**，历史作品靠其引用。
2. `arrangement` 后端**不透明**：只做结构/大小校验，不校验具体 id（避免与自定义花材冲突、避免前端加花就要后端同步）。
3. **内置素材已由矢量改为图片**：前端直接贴 `imageUrl`，不再需要按 `kind` 跑 draw 函数。矢量源仍在 `builtin-materials.data.ts` + 原型，仅用于生成 PNG（`scripts/materials-svg-to-png.mjs` → OSS）。
4. 素材目录进 `Material` 表：支持后台上下架（`active`）/换图/调序（`sortOrder`）而不发版。
5. 缩略图/姿态图**光栅化持久化于 OSS，DB 只存 URL**，展示与 renderer 解耦。

---

## 6. 待确认（影响 AI 实现）

1. 中转站抠图能力：图像编辑移除背景，还是单独接抠图服务？
2. 中转站可用图像模型名 & 是否支持图生图（带参考图）。
