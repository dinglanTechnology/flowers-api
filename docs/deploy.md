# flowers-api 部署交接文档

微信小程序「插了个花」业务后端。CI 构建 Docker 镜像 → Jenkins 部署。本文供运维参照。

---

## 1. 部署架构

| 组件 | 承载方式 |
|---|---|
| **应用 app** | CI 构建镜像推仓库 → Jenkins 在服务器 `docker run` |
| **PostgreSQL** | 阿里云 RDS（外部，表结构已手动初始化） |
| **Redis** | 运维在服务器自建（原生安装或自管容器），与 app 同机 |
| **对象存储** | 阿里云 OSS（外部） |

> Redis 由运维自行 provision；app 容器如何连到它取决于 Redis 的部署方式（见第 4 节①的连接说明），对应地填 `REDIS_URL`。

---

## 2. 服务器 / 环境要求

- Linux 服务器，2C4G 起步（出图任务吃内存）。
- **Docker ≥ 24**（跑 app 镜像）。
- Redis（运维自建）：与 app 同机，app 容器可达。
- 出站放行（见第 6 节）；入站仅需 HTTPS（见第 7 节）。
- 磁盘预留 10G+（镜像 + 日志）。

---

## 3. 交付清单（开发 → 运维）

| 交付物 | 说明 |
|---|---|
| **应用镜像** | CI 产出，推到镜像仓库；Jenkins 拉取。地址 + tag 规则由 CI 提供 |
| **`.env` 文件** | 含全部机密（见第 5 节），**不进 git**，安全私传 |
| **本文档** | 部署步骤、网络、验证 |

---

## 4. 部署步骤

### ① Redis（运维自建）

运维在服务器上装好 Redis，建议：**开启持久化（AOF）**、**`maxmemory-policy noeviction`**（Redis 存 refresh token + AI 任务队列，键不能被当缓存淘汰）、随机器自启。

app 容器如何连 Redis，按 Redis 的部署方式选一种，并据此填 `REDIS_URL`：

| Redis 部署方式 | app 的 `docker run` | `REDIS_URL` |
|---|---|---|
| 原生装在宿主机 | 加 `--add-host=host.docker.internal:host-gateway` | `redis://host.docker.internal:6379` |
| 原生装在宿主机（或用 host 网络） | 加 `--network host`（此时去掉 `-p`） | `redis://127.0.0.1:6379` |
| 运维用 docker 跑 Redis | app `--network <该容器所在网络>` | `redis://<redis容器名>:6379` |

> 若 Redis 设了密码，`REDIS_URL` 写成 `redis://:<密码>@<host>:6379`。

### ② Jenkins 部署 app（每次发版）

```bash
docker pull <registry>/flowers-api:<tag>
docker rm -f flowers-api 2>/dev/null || true
docker run -d --name flowers-api \
  --add-host=host.docker.internal:host-gateway \
  --env-file /path/to/.env \
  -p 3000:3000 \
  --restart unless-stopped \
  <registry>/flowers-api:<tag>
docker logs -f flowers-api
```

> 上面按「Redis 原生装宿主机」写；若运维用别的方式,按第 ① 节表格调整网络参数与 `REDIS_URL`。

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
| `REDIS_URL` | 是 | | 指向运维自建的 Redis，地址按第 4 节①的连接方式填（如 `redis://host.docker.internal:6379`；有密码则 `redis://:<密码>@host:6379`） |
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
| `OSS_CDN_BASE` | 否 | | 可选，图片 CDN/自定义域名；生产已绑 `https://flower-prod.zhilingtech.com`（新签发的 URL 走该域名，并消除 OSS 默认域名的强制下载） |

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

# schema 变更后（手动）
DATABASE_URL=<RDS> pnpm prisma db push
```

数据备份：RDS 由阿里云侧负责；Redis 持久化 + 备份由运维侧负责。
