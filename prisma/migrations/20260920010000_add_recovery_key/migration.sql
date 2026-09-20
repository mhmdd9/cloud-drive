ALTER TABLE "User" ADD COLUMN "recoveryEncryptedPrivateKey" TEXT;
ALTER TABLE "User" ADD COLUMN "recoverySalt" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryIv" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryKeyCreatedAt" TIMESTAMP(3);
