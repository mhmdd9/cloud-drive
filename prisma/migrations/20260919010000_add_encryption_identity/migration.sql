ALTER TABLE "User" ADD COLUMN "encryptionPublicKey" JSONB;
ALTER TABLE "User" ADD COLUMN "encryptionKeyCreatedAt" TIMESTAMP(3);
