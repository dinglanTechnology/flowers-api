-- Web 端认证适配：openid 解耦 + phone 作为跨端统一身份键
--
-- ⚠️ 上线前必须先清洗重复 phone，否则下方 UNIQUE INDEX 会创建失败（整个迁移事务回滚，数据无损）：
--   SELECT phone, count(*) FROM "User" WHERE phone IS NOT NULL GROUP BY phone HAVING count(*) > 1;
-- 清零重复后再执行本迁移。

-- 1) openid 改为可空（Web 用户无 openid；Postgres unique 允许多个 NULL 并存）
ALTER TABLE "User" ALTER COLUMN "openid" DROP NOT NULL;

-- 2) 新增 loginType，标识建号来源（存量用户默认 wechat）
ALTER TABLE "User" ADD COLUMN "loginType" TEXT NOT NULL DEFAULT 'wechat';

-- 3) phone 加唯一约束（跨端统一身份键）
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
