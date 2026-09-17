ALTER TABLE "User" ADD COLUMN "username" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_username_normalized_check"
    CHECK ("username" IS NULL OR ("username" COLLATE "C" ~ '^[a-z0-9][a-z0-9._-]{2,31}$'));

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
