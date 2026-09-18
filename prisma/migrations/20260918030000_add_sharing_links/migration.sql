CREATE UNIQUE INDEX "FileShare_fileId_userId_key" ON "FileShare"("fileId", "userId");

CREATE TABLE "SharedLink" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "fileId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'DOWNLOAD',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SharedLink_tokenHash_key" ON "SharedLink"("tokenHash");
CREATE INDEX "SharedLink_fileId_idx" ON "SharedLink"("fileId");
CREATE INDEX "SharedLink_ownerId_createdAt_idx" ON "SharedLink"("ownerId", "createdAt");
CREATE INDEX "SharedLink_expiresAt_idx" ON "SharedLink"("expiresAt");

ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
