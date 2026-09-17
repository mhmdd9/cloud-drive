import { getDb } from "@/lib/db";
import { headObject, type Storage } from "@/lib/storage";
import { checksumFromObjectKey, fileIdSchema, ObjectVerificationError, validVersionId, verifyObject } from "@/modules/files/validation";
import { z } from "zod";

const jobSchema = z.strictObject({ id: fileIdSchema });

export function workerConcurrency(value: string | undefined): number {
  if (value === undefined) return 2;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error("Invalid FILE_WORKER_CONCURRENCY");
  return Math.min(Number(value), 8);
}

function missingObject(error: unknown): boolean {
  return typeof error === "object" && error !== null && "$metadata" in error &&
    typeof error.$metadata === "object" && error.$metadata !== null &&
    "httpStatusCode" in error.$metadata && error.$metadata.httpStatusCode === 404;
}

export async function processFile(data: unknown, storage: Storage): Promise<void> {
  const { id } = jobSchema.parse(data);
  const db = getDb();
  const file = await db.file.findUnique({ where: { id } });
  if (!file || file.status !== "PROCESSING") return;
  let status: "READY" | "REJECTED" = "READY";
  try {
    if (!validVersionId(file.versionId)) throw new ObjectVerificationError();
    const metadata = await headObject(storage, file.objectKey, file.versionId);
    verifyObject(metadata, {
      size: file.size,
      checksum: checksumFromObjectKey(file.objectKey),
      kmsKeyId: storage.kmsKeyId,
      versionId: file.versionId,
    });
  } catch (error) {
    if (!(error instanceof ObjectVerificationError) && !missingObject(error)) throw error;
    status = "REJECTED";
  }
  await db.file.updateMany({
    where: { id: file.id, status: "PROCESSING", versionId: file.versionId },
    data: { status },
  });
}
