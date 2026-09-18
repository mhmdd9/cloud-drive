ALTER TABLE "File" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "File_ownerId_deletedAt_idx" ON "File"("ownerId", "deletedAt");

CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);
