-- 广场互动 + 个人中心 + AI 额度：
-- 1) PlazaPost 增加 viewCount（浏览量冗余计数，与 likeCount 同模式）
-- 2) PlazaPost 增加 workId 可空外键（来源作品；作品删除 → 级联撤回帖子 → 点赞随既有 Cascade 清理）
-- 3) AiTask 增加 workId（关联作品；不加 FK，作品删除后任务保留为历史；NULL=未保存草稿）

-- AlterTable
ALTER TABLE "PlazaPost" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "workId" TEXT;

-- AlterTable
ALTER TABLE "AiTask" ADD COLUMN "workId" TEXT;

-- CreateIndex
CREATE INDEX "PlazaPost_workId_idx" ON "PlazaPost"("workId");

-- CreateIndex
CREATE INDEX "AiTask_userId_workId_createdAt_idx" ON "AiTask"("userId", "workId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlazaPost" ADD CONSTRAINT "PlazaPost_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Work"("id") ON DELETE CASCADE ON UPDATE CASCADE;
