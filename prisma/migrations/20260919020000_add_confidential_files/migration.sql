CREATE TYPE "FileEncryptionMode" AS ENUM ('NONE', 'CONFIDENTIAL');

ALTER TABLE "File" ADD COLUMN "encryptionMode" "FileEncryptionMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "File" ADD COLUMN "encryptionIv" TEXT;
ALTER TABLE "File" ADD COLUMN "ownerEncryptedFileKey" TEXT;
ALTER TABLE "File" ADD COLUMN "originalSize" BIGINT;
ALTER TABLE "FileShare" ADD COLUMN "encryptedFileKey" TEXT;
