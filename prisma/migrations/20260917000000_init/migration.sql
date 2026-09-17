CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'REJECTED');

CREATE TYPE "SharePermission" AS ENUM ('VIEW', 'DOWNLOAD', 'EDIT');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupMember" (
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE TABLE "File" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "versionId" TEXT,
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "File_size_positive" CHECK ("size" > 0)
);

CREATE TABLE "FileShare" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "userId" UUID,
    "groupId" UUID,
    "permission" "SharePermission" NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "FileShare_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FileShare_exactly_one_recipient" CHECK ((("userId" IS NOT NULL)::int + ("groupId" IS NOT NULL)::int) = 1)
);

CREATE TABLE "GroupSharePolicy" (
    "groupId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "GroupSharePolicy_pkey" PRIMARY KEY ("groupId","roleId")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

CREATE UNIQUE INDEX "Group_name_key" ON "Group"("name");

CREATE INDEX "GroupMember_userId_idx" ON "GroupMember"("userId");

CREATE UNIQUE INDEX "File_objectKey_key" ON "File"("objectKey");

CREATE INDEX "File_ownerId_createdAt_idx" ON "File"("ownerId", "createdAt");

CREATE INDEX "File_status_createdAt_idx" ON "File"("status", "createdAt");

CREATE INDEX "FileShare_fileId_idx" ON "FileShare"("fileId");

CREATE INDEX "FileShare_userId_fileId_idx" ON "FileShare"("userId", "fileId");

CREATE INDEX "FileShare_groupId_fileId_idx" ON "FileShare"("groupId", "fileId");

CREATE INDEX "FileShare_expiresAt_idx" ON "FileShare"("expiresAt");

CREATE INDEX "GroupSharePolicy_roleId_idx" ON "GroupSharePolicy"("roleId");

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "File" ADD CONSTRAINT "File_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileShare" ADD CONSTRAINT "FileShare_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupSharePolicy" ADD CONSTRAINT "GroupSharePolicy_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupSharePolicy" ADD CONSTRAINT "GroupSharePolicy_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
