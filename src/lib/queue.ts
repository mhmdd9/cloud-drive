import { Queue } from "bullmq";
import { redisConnectionOptions } from "@/lib/redis";
import { fileIdSchema } from "@/modules/files/validation";

export const fileQueueName = "file-process";
export type FileJob = { id: string };

export function fileQueueConnection(worker = false) {
  const options = redisConnectionOptions();
  return {
    host: options.host,
    port: options.port,
    db: options.db,
    username: options.username,
    password: options.password,
    tls: options.tls,
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: worker ? null : 1,
  };
}

let queue: Queue<FileJob> | undefined;

export function getFileQueue(): Queue<FileJob> {
  if (!queue) {
    queue = new Queue<FileJob>(fileQueueName, {
      connection: fileQueueConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: { age: 86400, count: 10000 },
        removeOnFail: false,
      },
    });
    queue.on("error", () => {});
  }
  return queue;
}

export async function enqueueFile(id: string): Promise<void> {
  fileIdSchema.parse(id);
  const producer = getFileQueue();
  const job = await producer.add(fileQueueName, { id }, { jobId: id });
  if (await job.getState() === "failed") {
    try {
      await job.retry("failed");
    } catch (error) {
      if (await job.getState() === "failed") throw error;
    }
  }
}

export async function closeFileQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}
