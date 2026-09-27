CREATE TABLE "FileVersion" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "editedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FileVersion_fileId_objectKey_versionId_key" ON "FileVersion"("fileId", "objectKey", "versionId");
CREATE INDEX "FileVersion_fileId_createdAt_idx" ON "FileVersion"("fileId", "createdAt");
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
