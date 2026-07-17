-- AiTask 增加 thumbUrl：AI 成品图上传 OSS 时同步生成 480px webp 缩略图，
-- 列表/封面场景用缩略图代替 2MB+ 原图。历史任务为 NULL，消费方回退 resultUrl。

-- AlterTable
ALTER TABLE "AiTask" ADD COLUMN "thumbUrl" TEXT;
