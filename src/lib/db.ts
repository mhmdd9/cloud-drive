import { PrismaClient } from "@prisma/client";

const globalForDb = globalThis as typeof globalThis & {
  clouddriveDb?: PrismaClient;
};

export function getDb(): PrismaClient {
  globalForDb.clouddriveDb ??= new PrismaClient();
  return globalForDb.clouddriveDb;
}
