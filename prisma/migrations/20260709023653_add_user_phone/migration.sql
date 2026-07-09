-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "unionid" TEXT,
    "phone" TEXT,
    "nickname" TEXT NOT NULL DEFAULT '',
    "avatarId" TEXT NOT NULL DEFAULT 'lotus',
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Work" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '今日花事',
    "theme" TEXT NOT NULL DEFAULT 'night',
    "vaseId" TEXT NOT NULL,
    "arrangement" JSONB NOT NULL,
    "thumbnailUrl" TEXT,
    "dateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlazaPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "arrangement" JSONB NOT NULL,
    "thumbnailUrl" TEXT,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "auditStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlazaPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomMaterial" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseMaterialId" TEXT NOT NULL,
    "baseKind" TEXT,
    "imageUrl" TEXT NOT NULL,
    "sourceImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiTask" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "prompt" TEXT,
    "inputImageUrl" TEXT,
    "resultUrl" TEXT,
    "error" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "User"("openid");

-- CreateIndex
CREATE INDEX "Work_userId_dateKey_idx" ON "Work"("userId", "dateKey");

-- CreateIndex
CREATE INDEX "Work_userId_createdAt_idx" ON "Work"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlazaPost_auditStatus_createdAt_idx" ON "PlazaPost"("auditStatus", "createdAt");

-- CreateIndex
CREATE INDEX "CustomMaterial_userId_createdAt_idx" ON "CustomMaterial"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiTask_userId_createdAt_idx" ON "AiTask"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Work" ADD CONSTRAINT "Work_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlazaPost" ADD CONSTRAINT "PlazaPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomMaterial" ADD CONSTRAINT "CustomMaterial_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiTask" ADD CONSTRAINT "AiTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
