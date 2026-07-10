# 插了个花 · 前端对接文档

面向小程序前端开发。Swagger 在线调试：`/api/docs`。

---

## 1. 基础约定

- **Base URL**：全局前缀 `/api`，如 `https://flower-api-dev.zhilingtech.com/api`
- **编码**：请求/响应均 `application/json; charset=utf-8`
- **统一响应包裹**：所有接口都返回 `{ code, data, msg }`

```jsonc
// 成功：HTTP 200
{ "code": 0, "data": { /* 业务数据 */ }, "msg": "ok" }

// 失败：HTTP 为真实状态码（400/401/403/404/429/500）
{ "code": 401, "data": null, "msg": "令牌无效或已过期" }
```

> **前端封装建议**：拦截器里判断 `code === 0` 取 `data`，否则按 HTTP 状态 + `msg` 走错误处理。下文各接口的「响应」只写 `data` 部分。

### 错误码

| HTTP | 含义 | 典型场景 |
|---|---|---|
| 400 | 参数错误 / 校验失败 / 内容审核不通过 | 字段缺失、昵称/标题违规 |
| 401 | 未认证 | 缺 token 或 token 失效 |
| 403 | 无权限 | 操作非本人资源 |
| 404 | 不存在 | 资源 id 无效 |
| 429 | 请求过频 | AI 接口限流（每用户 60s ≤ 10 次） |
| 500 | 服务器错误 | 后端异常 |

---

## 2. 鉴权

除标 🔓 外所有接口都要登录，请求头带：

```
Authorization: Bearer <accessToken>
```

### 登录流程

```
wx.login() 拿 code
  → POST /api/auth/wechat/login { code }
  → 得 { accessToken, refreshToken, user }
  → 本地存两个 token；之后每个请求带 accessToken
```

### 令牌说明

| 令牌 | 用途 | 过期后 |
|---|---|---|
| `accessToken` | 每次请求带 | 请求返回 401 |
| `refreshToken` | 换新 accessToken | 需重新走微信登录 |

- 收到 **401** → 用 `refreshToken` 调 `POST /api/auth/refresh` 换新的一对令牌，重试原请求；refresh 也失效则重新登录。
- refresh 是**一次性轮换**：每次刷新会返回新的 refreshToken，旧的立即失效，务必覆盖保存。

---

## 3. 接口清单

### 3.1 认证

#### `POST /auth/wechat/login` 🔓
微信登录。传 `phoneCode` 则同步绑定手机号。

```jsonc
// 请求
{ "code": "wx-login-code", "phoneCode": "可选", "nickname": "可选(≤12字)", "avatarUrl": "可选,OSS地址" }
// 响应 data
{ "accessToken": "...", "refreshToken": "...", "user": { /* User */ } }
```

#### `POST /auth/refresh` 🔓
```jsonc
{ "refreshToken": "..." }          // 请求
{ "accessToken": "...", "refreshToken": "..." }  // 响应 data
```

#### `POST /auth/logout` 🔓
```jsonc
{ "refreshToken": "..." }   // 请求
{ "success": true }         // 响应 data
```

### 3.2 用户

#### `GET /users/me`
响应 `data`：`User`

#### `PATCH /users/me`
```jsonc
{ "nickname": "一枝春", "avatarId": "lotus" }  // 均可选；nickname 过文本审核，违规 400
```
响应 `data`：`User`

### 3.3 客户端配置

#### `GET /config/bootstrap` 🔓
主题 + 头像预设。

```jsonc
// 响应 data
{
  "themes": [ { "id": "night", "label": "夜间创作台", "bg": "#0d0c0b", "accent": "#f4e8b8",
               "vase": ["#25302e","#5d6a61","#0f1513"], "previewFlower": ["#dc7f82","#f0c05a","#b86582"], /* … */ } ],
  "avatars": [ { "id": "lotus", "label": "荷", "colors": ["#e9a0b5","#78945e"] } ]
}
```

### 3.4 素材（内置目录）

#### `GET /materials/catalog` 🔓
内置素材目录。**素材是图片渲染**，直接贴 `imageUrl`。

```jsonc
// 响应 data
{
  "categories": [ { "id": "flower", "label": "花朵" }, { "id":"greenery","label":"枝叶" },
                  { "id":"line","label":"线条" }, { "id":"vase","label":"花器" } ],
  "materials": [
    {
      "id": "mat-rose", "name": "玫瑰", "category": "flower",
      "imageUrl": ".../default-materials/flower/mat-rose.png",   // 目录/选择器缩略图
      "styles": [                                                 // 花/枝/线：6 款姿态
        { "styleOption": "rose-full-mid", "name": "玫瑰盛放", "imageUrl": ".../flower/mat-rose/rose-full-mid.png" }
        // …共 6
      ]
    },
    {
      "id": "mat-vase-ink", "name": "墨色瓶", "category": "vase",
      "imageUrl": ".../default-materials/vase/mat-vase-ink.png",
      "styles": null                                              // 花器：单样式
    }
  ]
}
```

**渲染规则（重要）**
```
material.styles?.length
  ? 选择器展示 6 款姿态，每款贴自己的 styles[i].imageUrl；用户选中的 styleOption 记到作品项
  : 单样式，直接贴 material.imageUrl
```
- 所有素材图都是**透明底 PNG**，姿态图已把长度烘进去，前端只需做 size/旋转/镜像/透明度等几何变换。

### 3.5 自定义花材

#### `GET /materials/custom`
响应 `data`：`CustomMaterial[]`（当前用户，倒序）

#### `POST /materials/custom`
```jsonc
{ "name":"阳台茉莉", "category":"flower", "baseMaterialId":"mat-rose",
  "baseKind":"rose", "imageUrl":"抠图成品OSS URL", "sourceImageUrl":"原图OSS URL" }
// name 过文本审核，违规 400；响应 data：CustomMaterial
```

#### `DELETE /materials/custom/:id`
响应 `data`：`{ ok: true }`；非本人 403 / 不存在 404

> **自定义素材没有多姿态**：只有一张图 + 几何变换，前端别给它显示姿态面板。

### 3.6 作品 + 创作日历

#### `GET /works/calendar?month=YYYY-MM`
响应 `data`：`{ "2026-07-09": 3, ... }`（按天的作品数，供日历角标）

#### `GET /works?dateKey=YYYY-MM-DD`
响应 `data`：`Work[]`（某天作品，倒序）

#### `GET /works/:id`
响应 `data`：`Work`；403 / 404

#### `POST /works`
```jsonc
{ "title":"今日花事", "theme":"night", "vaseId":"mat-vase-ink",
  "arrangement": { /* 插花快照，后端不透明 */ },
  "thumbnail":"dataURL 或 已直传的OSS URL", "dateKey":"2026-07-09" }
// 响应 data：Work
```

#### `PATCH /works/:id`
上述字段任意子集；响应 `data`：`Work`；403 / 404

#### `DELETE /works/:id`
响应 `data`：`{ ok: true }`；403 / 404

### 3.7 分享广场

#### `GET /plaza?page=&size=`
分页 feed（仅 approved），每条带 `liked`。`page` 从 1 开始，默认 1；`size` 1–50，默认 20。
```jsonc
{ "items": [ /* PlazaPost[]，含 liked */ ], "total": 128, "page": 1, "size": 20 }
```

#### `GET /plaza/:id`
响应 `data`：`PlazaPost`（含 `liked`）；404

#### `POST /plaza`
分享作品，标题过文本审核。
```jsonc
{ "workId": "已有作品id" }
// 或直接给作品信息：
{ "title":"...", "theme":"night", "arrangement": {…}, "thumbnail":"OSS URL" }
// 响应 data：PlazaPost
```

#### `POST /plaza/:id/like`
**点赞/取消赞的同一个接口**（幂等 toggle）。
```jsonc
// 响应 data：liked = 本次操作后的状态
{ "likeCount": 13, "liked": true }
```

### 3.8 图片上传

**推荐直传流程**（后端不扛图片流量）：
```
POST /upload/signature { scene } → 得直传签名
  → wx.uploadFile 把文件直传 OSS（用签名里的字段）
  → 拿 fileUrl，把 URL 传给业务接口（如 works.thumbnail / plaza.thumbnail / cutout.sourceImageUrl）
```

#### `POST /upload/signature`
```jsonc
{ "scene": "work-thumbnail", "ext": "png" }   // scene: cutout-source|export-reference|work-thumbnail|general
// 响应 data：OssUploadSignature（host/key/policy/signature/ossAccessKeyId/expire/maxSize/fileUrl）
```
`wx.uploadFile` 表单字段：
```js
{ key, OSSAccessKeyId, policy, signature, success_action_status: '200' }
// 成功后用返回的 fileUrl
```

#### `POST /upload`（服务端代传，兜底小图）
`multipart/form-data`（字段 `file`）或 JSON `{ dataUrl }`；≤8MB，png/jpeg/webp。响应 `data`：`{ url }`

### 3.9 AI 能力（异步任务）

**提交 → 轮询**模式。POST 立即返 `taskId`，再轮询 GET 直到 `status` 终态。限流：每用户 60s ≤ 10 次（429）。

`status`：`pending`（入队）→ `running`（处理中）→ `succeeded` / `failed`（终态）。轮询到 `succeeded` 取结果 URL，`failed` 看 `error`。

#### `POST /image2` — 由插花生成摄影风格图
```jsonc
{ "prompt":"…", "referenceImageUrl":"参考图OSS URL(推荐)", "size":"1024x1536" }
// 响应 data：{ taskId, status, progress }
```
#### `GET /image2/:taskId`
```jsonc
{ "status":"succeeded", "progress":100, "imageUrl":"结果OSS URL", "error": null }
```

#### `POST /cutout-flower` — 上传照片抠图成透明底素材
只传 类型 / 花材名 / 照片链接，prompt 等由后端内置处理。
```jsonc
{ "category":"flower", "name":"院子里的月季", "sourceImageUrl":"照片OSS URL" }
// 响应 data：{ taskId, status, progress }
```
#### `GET /cutout-flower/:taskId`
```jsonc
{ "status":"succeeded", "progress":100, "image":"透明底图OSS URL", "error": null }
```
> 抠图成功后，拿 `image` 调 `POST /materials/custom` 入库成花材。

---

## 4. 数据模型速查

```ts
type ThemeId = 'night' | 'light' | 'morning' | 'rouge' | 'gallery' | 'onyx';
type AvatarId = 'lotus' | 'orchid' | 'sun' | 'leaf' | 'rose' | 'moon' | 'tea' | 'ink';
type MaterialCategory = 'flower' | 'greenery' | 'line' | 'vase';

interface User {
  id: string;
  nickname: string;
  avatarId: AvatarId;
  avatarUrl: string | null;
  phone: string | null;      // 未绑定为 null
  createdAt: string;         // ISO
}

interface MaterialStyle {
  styleOption: string;       // "rose-full-mid"，选中后记到作品项
  name: string;              // "玫瑰盛放"
  imageUrl: string;          // 透明底 PNG（已烘入长度）
}
interface BuiltinMaterial {
  id: string;                // "mat-rose"
  name: string;
  category: MaterialCategory;
  imageUrl: string | null;   // 缩略图/单样式素材图
  styles: MaterialStyle[] | null;  // 花/枝/线 6 款；花器等为 null
}

interface CustomMaterial {
  id: string; userId: string;
  name: string; category: MaterialCategory;
  baseMaterialId: string; baseKind: string | null;
  imageUrl: string;          // 抠图成品
  sourceImageUrl: string | null;
  createdAt: string;
}

interface Work {
  id: string; userId: string;
  title: string; theme: ThemeId; vaseId: string;
  arrangement: Record<string, unknown>;  // 插花快照，后端不透明
  thumbnailUrl: string | null;
  dateKey: string;           // "2026-07-09"，本地时区生成
  createdAt: string; updatedAt: string;
}

interface PlazaPost {
  id: string; userId: string;
  authorName: string;        // 作者昵称快照
  title: string; theme: ThemeId;
  arrangement: Record<string, unknown>;
  thumbnailUrl: string | null;
  likeCount: number;
  liked: boolean;            // 当前用户是否已赞
  auditStatus: 'pending' | 'approved' | 'rejected';  // feed 仅 approved
  createdAt: string;
}

interface Theme {           // GET /config/bootstrap
  id: ThemeId; label: string; note: string;
  bg: string; panel: string; panel2: string; text: string; muted: string; line: string;
  accent: string; accent2: string; danger: string; canvas: string; paper: string; shadow: string;
  vase: string[]; previewFlower: string[];
}
interface AvatarOption { id: AvatarId; label: string; colors: string[]; }
```

### 作品项（arrangement.items[]）参考结构
前端本地维护，后端只存不校验。放置一根花枝：
```jsonc
{
  "assetId": "mat-rose",        // 关联素材（内置或自定义 id）
  "styleOption": "rose-full-mid", // 选中的姿态（自定义素材无）
  "imageUrl": "…",              // 贴的图（内置取 styles[i].imageUrl，自定义取其 imageUrl）
  "x": 50, "y": 43, "size": 22, "rotation": 0, "opacity": 100, "mirrored": false, "z": 31
}
```

---

## 5. 前端要点清单

- [ ] 请求拦截器：带 `Authorization`，解包 `{code,data,msg}`，401 自动 refresh 重试。
- [ ] refresh 轮换：每次刷新覆盖保存新的 refreshToken。
- [ ] 素材目录：`styles?.length` 决定单/多样式渲染。
- [ ] 图片一律走 `/upload/signature` 直传 OSS，业务接口只收 URL。
- [ ] AI：提交后轮询 taskId，注意 429 限流退避。
- [ ] 点赞用同一个 like 接口 toggle，按返回 `liked` 更新 UI。
- [ ] 自定义素材单样式，隐藏姿态面板。
- [ ] 昵称/素材名/广场标题可能因内容审核返回 400，给用户提示。

> ⚠️ **图片内容审核暂未启用**（仅文本审核）；上线合规前需补 `imgSecCheck`。
