# flowers-api 部署交接文档

微信小程序「插了个花」业务后端。CI 构建 Docker 镜像 → Jenkins 部署。本文供运维参照。

---

## 1. 部署架构

| 组件 | 承载方式 |
|---|---|
| **应用 app** | CI 构建镜像推仓库 → Jenkins 在服务器 `docker run` |
| **PostgreSQL** | 阿里云 RDS（外部，表结构已手动初始化） |
| **Redis** | 服务器自建，用本仓库 `docker-compose.yml` 起（同机、与 app 共用 docker 网络） |
| **对象存储** | 阿里云 OSS（外部） |

> app、Redis 在**同一台服务器**，通过 docker 网络 `flowers-net` 互连；app 用服务名 `redis` 访问 Redis，Redis 端口不对外暴露。

---

## 2. 服务器 / 环境要求

- Linux 服务器，2C4G 起步（出图任务吃内存）。
- **Docker ≥ 24 + Docker Compose v2**。
- 出站放行（见第 6 节）；入站仅需 HTTPS（见第 7 节）。
- 磁盘预留 10G+（镜像 + Redis 数据卷）。

---

## 3. 交付清单（开发 → 运维）

| 交付物 | 说明 |
|---|---|
| **应用镜像** | CI 产出，推到镜像仓库；Jenkins 拉取。地址 + tag 规则由 CI 提供 |
| **`.env` 文件** | 含全部机密（见第 5 节），**不进 git**，安全私传 |
| **`docker-compose.yml`** | 仓库内，仅用于起自建 Redis |
| **本文档** | 部署步骤、网络、验证 |

---

## 4. 部署步骤

### ① 起自建 Redis（首次 / 服务器重装时）

在服务器上仓库目录执行（会创建 `flowers-net` 网络 + 带密码持久化的 Redis）：

```bash
REDIS_PASSWORD=<强密码> docker compose up -d
docker compose ps          # 确认 flower-redis healthy
```

Redis 已配：AOF 持久化（`redisdata` 卷，重启不丢 token/队列）、必须密码、`noeviction`（不淘汰键）、`restart: unless-stopped`。

### ② Jenkins 部署 app（每次发版）

app 加入同一网络 `flowers-net`，通过服务名 `redis` 连 Redis：

```bash
docker pull <registry>/flowers-api:<tag>
docker rm -f flowers-api 2>/dev/null || true
docker run -d --name flowers-api \
  --network flowers-net \
  --env-file /path/to/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  <registry>/flowers-api:<tag>
docker logs -f flowers-api
```

### ③ 数据库表结构

阿里云 RDS 的表结构由开发用 `prisma db push` **手动初始化（已完成）**。
⚠️ 后续若 schema 有变更，需再次手动执行：`DATABASE_URL=<RDS> pnpm prisma db push`（app 镜像启动不会自动建表）。

---

## 5. 环境变量清单（`.env`）

⚠️ 行内注释只能用 `#`，**不要用 `;`**。

| 变量 | 必填 | 机密 | 说明 / 取值 |
|---|---|---|---|
| `NODE_ENV` | 是 | | `production` |
| `PORT` | 否 | | 默认 3000 |
| `DATABASE_URL` | 是 | ✅ | 阿里云 RDS PostgreSQL 连接串 |
| `REDIS_URL` | 是 | ✅ | `redis://:<强密码>@redis:6379`（服务名 redis + 与 compose 的 `REDIS_PASSWORD` 一致） |
| `JWT_SECRET` | 是 | ✅ | 令牌签名密钥，`openssl rand -base64 48` |
| `JWT_ACCESS_EXPIRES_IN` | 否 | | 默认 30d |
| `JWT_REFRESH_EXPIRES_IN` | 否 | | 默认 90d |
| `WX_APPID` | 是 | | 微信小程序 AppID |
| `WX_SECRET` | 是 | ✅ | 微信小程序 AppSecret |
| `AI_PROVIDER` | 是 | | `relay`（`mock` 只出占位图） |
| `AI_ATLAS_BASE_URL` | 是 | | `https://api.atlascloud.ai/api/v1` |
| `AI_ATLAS_API_KEY` | 是 | ✅ | Atlas Cloud API Key（主用 AI） |
| `AI_ATLAS_CUTOUT_MODEL` | 建议 | | `youchuan/v8.1/remove-background`（抠图出真透明底） |
| `AI_TOKENLAB_BASE_URL` | 否 | | `https://api.tokenlab.sh/v1`（备用，未验证，可不填） |
| `AI_TOKENLAB_API_KEY` | 否 | ✅ | TokenLab API Key（备用） |
| `STORAGE_PROVIDER` | 是 | | `oss` |
| `OSS_REGION` | 是 | | 如 `oss-cn-hangzhou` |
| `OSS_BUCKET` | 是 | | 存储桶名 |
| `OSS_ACCESS_KEY_ID` | 是 | ✅ | 阿里云 AccessKey ID |
| `OSS_ACCESS_KEY_SECRET` | 是 | ✅ | 阿里云 AccessKey Secret |
| `OSS_CDN_BASE` | 否 | | 可选，图片 CDN 域名 |

另外起 Redis 时需 **`REDIS_PASSWORD`**（compose 用；与 `REDIS_URL` 里的密码保持一致）。

> 程序启动会校验关键变量，缺失会 fail-fast 并打印缺哪个。

---

## 6. 外部网络（出站放行 443）

- `api.atlascloud.ai` — 主用 AI（生图/抠图）
- 阿里云 OSS endpoint（`*.aliyuncs.com`）— 图片存储
- 阿里云 RDS 地址 — 数据库
- `api.weixin.qq.com` — 微信登录
- `api.tokenlab.sh` — 备用 AI（若启用）

单张出图耗时 **40–60s**（Atlas 同步出图），反代 `proxy_read_timeout` 需 ≥ 120s。

---

## 7. HTTPS / 反向代理 / 域名（微信小程序必需）

微信小程序只允许请求 **HTTPS 且已 ICP 备案** 的域名。运维需：
1. 已备案域名 + TLS 证书；
2. Nginx/网关反代到 app 的 `3000`；
3. 该域名配到微信小程序后台 → 服务器域名 → request 合法域名。

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 120s;      # 出图慢，别用默认 60s
    client_max_body_size 20m;     # 允许上传参考图
}
```

---

## 8. 部署后验证

```bash
curl https://<域名>/api/health          # 健康检查
# 浏览器打开 https://<域名>/api/docs     # 接口文档
```

冒烟顺序：微信登录 → 上传图 → 提交 image2 出图（轮询任务到 succeeded）→ 提交 cutout 抠图。AI 问题先看 `docker logs flowers-api`。

---

## 9. 常用运维

```bash
# 更新发版（Jenkins 等价动作）
docker pull <registry>/flowers-api:<tag> && docker rm -f flowers-api && docker run -d ...（同第 4 节②）

docker logs -f flowers-api            # 应用日志
docker compose restart redis          # 重启 Redis（数据在 redisdata 卷，不丢）
docker exec -it flower-redis redis-cli -a <密码> ping   # 测 Redis

# schema 变更后（手动）
DATABASE_URL=<RDS> pnpm prisma db push
```

数据备份：RDS 由阿里云侧负责；Redis 数据在 `redisdata` 卷（AOF）。
