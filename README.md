# flowers-api

「插了个花」微信小程序业务后端服务。基于 NestJS + PostgreSQL(Prisma) + Redis(BullMQ)，
AI 能力对接第三方 OpenAI 兼容中转站，图片存储阿里云 OSS。

> 完整架构设计见 [`docs/architecture.md`](docs/architecture.md)。
> 当前为 **P0 脚手架**：目录结构与模块骨架已就绪，各业务接口按阶段（P1~P7）逐步实现。

## 技术栈

- NestJS 11 / TypeScript
- Prisma + PostgreSQL
- BullMQ + Redis（AI 异步任务）
- 微信小程序 `code2session` + JWT
- 第三方 OpenAI 兼容中转站（可插拔 `AiProvider`）
- 阿里云 OSS / 本地 MinIO（可插拔 `StorageProvider`）

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env        # 按需填写微信/AI/OSS 密钥

# 3. 启动本地依赖（Postgres + Redis + MinIO）
docker-compose up -d

# 4. 生成 Prisma Client + 建表
pnpm prisma:generate
pnpm prisma:migrate

# 5. 启动开发服务
pnpm start:dev
```

- 服务地址：`http://localhost:3000/api`
- 接口文档：`http://localhost:3000/api/docs`
- 健康检查：`GET /api/health`

> 本地无需真实 AI/存储：`.env` 中 `AI_PROVIDER=mock`、`STORAGE_PROVIDER=minio` 即可联调。

## 目录结构

```
src/
├─ main.ts                  # 入口：全局前缀 api、校验管道、Swagger、CORS
├─ app.module.ts            # 根模块：装配 Config/Prisma/Storage + 各业务模块
├─ app.controller.ts        # 健康检查
├─ config/                  # 环境变量加载与校验
├─ common/                  # 守卫 / 装饰器 / 拦截器 / 过滤器 / 通用 DTO
├─ prisma/                  # PrismaModule + PrismaService
├─ storage/                 # 存储适配层（OSS / MinIO）
├─ wechat/                  # 微信内容安全审核（供广场）
└─ modules/
   ├─ auth/                 # 微信登录 + JWT        (P1)
   ├─ users/                # 用户资料              (P2)
   ├─ works/                # 作品 + 创作日历        (P3)
   ├─ ai/                   # image2 / cutout 任务   (P5)
   ├─ upload/               # 图片上传              (P5)
   ├─ materials/            # 自定义花材            (P6)
   └─ plaza/                # 分享广场 + 内容审核     (P4)
prisma/schema.prisma        # 数据模型
docker-compose.yml          # 本地 Postgres/Redis/MinIO
```

## 开发阶段

| 阶段 | 内容 |
|---|---|
| P0 ✅ | 脚手架：工程骨架 + 模块结构 + 基础设施 |
| P1 | 微信 `code2session` + JWT + 全局守卫 |
| P2 | 用户资料 `GET/PATCH /users/me` |
| P3 | 作品 CRUD + 日历聚合 |
| P5 | AiProvider(中转站) + BullMQ + OSS + image2/cutout |
| P6 | 自定义花材 |
| P4 | 广场 + 微信内容审核 |
| P7 | 限流 / 日志 / 部署加固 |

## 常用脚本

```bash
pnpm start:dev        # 开发（热重载）
pnpm build            # 编译
pnpm lint             # 代码检查
pnpm test             # 单测
pnpm prisma:studio    # 可视化查看数据库
```
