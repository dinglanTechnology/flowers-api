# flowers-api 部署交接文档

微信小程序「插了个花」业务后端。Docker 化部署,单命令拉起。本文供运维参照。

---

## 1. 交付清单（开发 → 运维）

| 交付物 | 说明 |
|---|---|
| **代码仓库** | git 地址 + 分支（当前 `main`）。运维在服务器上 `git clone` |
| **`.env` 文件** | 含全部机密(见第 4 节)。**不进 git**,由开发/运维私下安全传递 |
| **本文档** | 部署方式、环境要求、网络与验证 |

> 代码已含 `Dockerfile`、`docker-compose.yml`、`.env.example`(模板,无机密)。运维照 `.env.example` 填一份 `.env` 即可,或直接用开发给的。

---

## 2. 服务器 / 环境要求

- Linux 服务器(x86_64 或 arm64),2C4G 起步(出图任务吃内存)。
- **Docker ≥ 24 + Docker Compose v2**（`docker compose` 命令）。
- 公网**出站**放行(见第 5 节);对外**入站**仅需 HTTPS(见第 6 节)。
- 磁盘:预留 10G+（镜像 + 数据卷 + 上传/生成图缓存）。

---

## 3. 部署方式

### 方案一：compose 全家桶（app + PostgreSQL + Redis + MinIO 一起跑）

适合自管数据库/存储的单机部署。

```bash
git clone <repo> && cd flowers-api
# 放入运维填好的 .env
docker compose up -d --build      # 构建镜像 + 起全部服务 + 自动建表(prisma db push)
docker compose ps                 # 看状态
docker compose logs -f app        # 看应用日志
```

服务说明:
- `app` 应用(端口 3000);`migrate` 一次性建表后退出;`postgres`/`redis`/`minio` 依赖。
- `app` 等 `postgres`/`redis` 健康、`migrate` 完成后才启动(已配 healthcheck + 依赖顺序)。
- Redis 已开 AOF 持久化,数据落 `redisdata` 卷(refresh token 不丢)。

### 方案二：用云托管数据库/Redis/OSS（推荐生产）

若用云 RDS(PostgreSQL)、云 Redis、阿里云 OSS：
- 在 `.env` 里把 `DATABASE_URL` / `REDIS_URL` / `OSS_*` 指向云实例;
- 从 `docker-compose.yml` 删掉 `postgres`/`redis`/`minio` 三个服务及对应 `depends_on`,只保留 `app`(和 `migrate`,若仍要容器内建表)。
- 由开发确认后再删。

---

## 4. 环境变量清单（`.env`）

⚠️ 注意:`.env` 行内注释只能用 `#`,**不要用 `;`**(docker compose 解析器不认)。

| 变量 | 必填 | 机密 | 说明 / 谁提供 |
|---|---|---|---|
| `PORT` | 否 | | 默认 3000 |
| `NODE_ENV` | 是 | | 生产填 `production` |
| `DATABASE_URL` | 是 | ✅ | PostgreSQL 连接串。compose 自带库填 `postgresql://flower:flower@postgres:5432/flower?schema=public`;云库填云实例串 |
| `REDIS_URL` | 是 | | compose 自带填 `redis://redis:6379`(compose 内已覆盖);云 Redis 填实例串(带密码/TLS) |
| `JWT_SECRET` | 是 | ✅ | 登录令牌签名密钥。生产必须随机:`openssl rand -base64 48` |
| `JWT_ACCESS_EXPIRES_IN` | 否 | | 默认 30d |
| `JWT_REFRESH_EXPIRES_IN` | 否 | | 默认 90d |
| `WX_APPID` | 是 | | 微信小程序 AppID(小程序后台) |
| `WX_SECRET` | 是 | ✅ | 微信小程序 AppSecret |
| `AI_PROVIDER` | 是 | | 生产填 `relay`(填 `mock` 则不调外部只出占位图) |
| `AI_ATLAS_BASE_URL` | 是 | | `https://api.atlascloud.ai/api/v1` |
| `AI_ATLAS_API_KEY` | 是 | ✅ | Atlas Cloud API Key(主用 AI) |
| `AI_ATLAS_CUTOUT_MODEL` | 否 | | 抠图模型,建议 `youchuan/v8.1/remove-background`(出真透明底) |
| `AI_TOKENLAB_BASE_URL` | 否 | | `https://api.tokenlab.sh/v1`(备用,主用挂了才用) |
| `AI_TOKENLAB_API_KEY` | 否 | ✅ | TokenLab API Key。**备用尚未验证,可暂不填** |
| `STORAGE_PROVIDER` | 是 | | `oss`(阿里云) 或 `minio`(compose 自带) |
| `OSS_REGION` | oss时 | | 如 `oss-cn-hangzhou` |
| `OSS_BUCKET` | 是 | | 存储桶名 |
| `OSS_ACCESS_KEY_ID` | 是 | ✅ | 阿里云 AccessKey ID |
| `OSS_ACCESS_KEY_SECRET` | 是 | ✅ | 阿里云 AccessKey Secret |
| `OSS_ENDPOINT` | minio时 | | 用 compose 自带 minio 时填 `http://minio:9000`;真实 OSS 留空 |
| `OSS_CDN_BASE` | 否 | | 可选,图片 CDN 域名 |

> **机密项(✅)** 是需要重点保护、单独安全传递的。启动时程序会校验关键变量,缺失会 fail-fast 并打印缺哪个。

---

## 5. 外部网络（出站放行）

应用需能访问以下外部服务,防火墙/安全组放行 **443 出站**:

- `api.atlascloud.ai` — 主用 AI 中转站(生图/抠图)
- `api.tokenlab.sh` — 备用 AI 中转站(若启用)
- 阿里云 OSS endpoint(如 `*.aliyuncs.com`)— 图片存储
- `api.weixin.qq.com` — 微信登录/接口

单张出图可能耗时 **40–60s**(Atlas 同步出图),反向代理的 `proxy_read_timeout` 需 ≥ 120s。

---

## 6. HTTPS / 反向代理 / 域名（微信小程序必需）

微信小程序只允许请求 **HTTPS 且已备案** 的域名。运维需:

1. 准备一个已 ICP 备案的域名;
2. 配 Nginx/网关反代到 `app` 容器的 `3000` 端口,挂 TLS 证书;
3. 该 HTTPS 域名要在**微信小程序后台 → 开发管理 → 服务器域名**里配置 request 合法域名。

Nginx 关键片段(注意长超时):

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;      # 出图慢,别用默认 60s
    client_max_body_size 20m;     # 允许上传参考图
}
```

---

## 7. 数据持久化 / 备份

- compose 卷:`pgdata`(数据库)、`redisdata`(Redis AOF)、`miniodata`(MinIO 对象)。
- 用云托管的对应部分由云侧负责备份。
- 自管 PostgreSQL 建议定期 `pg_dump` 备份 `pgdata`。

---

## 8. 部署后验证

```bash
# 健康检查(容器内/反代后)
curl http://<host>:3000/api/health          # 或 https://<域名>/api/health
# 接口文档
浏览器打开 https://<域名>/api/docs
```

冒烟测试顺序:微信登录 → 上传图 → 提交 image2 出图(轮询任务到 succeeded)→ 提交 cutout 抠图。AI 相关问题先看 `docker compose logs app` 里 provider 日志。

---

## 9. 常用运维命令

```bash
docker compose up -d --build        # 更新代码后重建并重启
docker compose restart app          # 只重启应用
docker compose logs -f app          # 跟踪日志
docker compose down                 # 停服(保留数据卷)
docker compose exec app node -e "require('http').get('http://localhost:3000/api/health',r=>{r.pipe(process.stdout)})"  # 容器内健康检查
```

代码更新流程:`git pull` → `docker compose up -d --build`(migrate 会自动同步表结构)。
