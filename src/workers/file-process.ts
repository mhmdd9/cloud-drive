import "dotenv/config";
import { Worker } from "bullmq";
import { getDb } from "@/lib/db";
import { closeFileQueue, fileQueueConnection, fileQueueName, type FileJob } from "@/lib/queue";
import { createStorage } from "@/lib/storage";
import { processFile, workerConcurrency } from "@/modules/files/process";
import { fileIdSchema } from "@/modules/files/validation";
import { purgeExpiredTrash } from "@/modules/files/trash";

async function main(): Promise<void> {
  const concurrency = workerConcurrency(process.env.FILE_WORKER_CONCURRENCY);
  const connection = fileQueueConnection(true);
  const storage = createStorage();
  const worker = new Worker<FileJob>(fileQueueName, async (job) => {
    if (job.name !== fileQueueName) throw new Error("Invalid job");
    await processFile(job.data, storage);
  }, { connection, concurrency });
  const purge = async () => {
    try {
      const count = await purgeExpiredTrash(storage);
      if (count > 0) console.log(`Purged ${count} expired trash file(s)`);
    } catch (error) { console.error("Trash purge cycle failed", error); }
  };
  await purge();
  const purgeTimer = setInterval(() => { void purge(); }, 60 * 60 * 1000);
  worker.on("error", () => {});
  worker.on("failed", (job) => {
    console.error(fileIdSchema.safeParse(job?.id).success ? job?.id : "unknown");
  });
  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= (async () => {
      try {
        await worker.close();
      } finally {
        clearInterval(purgeTimer);
        await Promise.allSettled([closeFileQueue(), getDb().$disconnect()]);
        storage.client.destroy();
      }
    })();
    return closing;
  };
  const stop = () => {
    void close().catch(() => { process.exitCode = 1; });
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await worker.waitUntilReady();
  } catch (error) {
    await close();
    throw error;
  }
}

void main().catch(() => {
  process.exitCode = 1;
});
