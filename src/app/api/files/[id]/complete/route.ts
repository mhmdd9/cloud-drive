import { requireUser } from "@/modules/auth/session";
import { ApiError, apiError, assertSameOrigin } from "@/lib/http";
import { getDb } from "@/lib/db";
import { createStorage, headObject } from "@/lib/storage";
import { enqueueFile } from "@/lib/queue";
import { checksumFromObjectKey, fileIdSchema, ObjectVerificationError, verifyObject } from "@/modules/files/validation";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
    const db = getDb();
    let file = await db.file.findFirst({ where: { id, ownerId: user.id } });
    if (!file) throw new ApiError(404, "File not found");
    if (file.status === "PENDING") {
      const storage = createStorage();
      try {
        const metadata = await headObject(storage, file.objectKey);
        const versionId = verifyObject(metadata, {
          size: file.size,
          checksum: checksumFromObjectKey(file.objectKey),
          kmsKeyId: storage.kmsKeyId,
        });
        await db.file.updateMany({
          where: { id, ownerId: user.id, status: "PENDING", versionId: null },
          data: { versionId, status: "PROCESSING" },
        });
      } finally {
        storage.client.destroy();
      }
      file = await db.file.findFirst({ where: { id, ownerId: user.id } });
      if (!file) throw new ApiError(404, "File not found");
    }
    if (file.status === "REJECTED") throw new ApiError(409, "File was rejected");
    if (file.status === "PENDING") throw new ApiError(409, "File cannot be completed");
    if (file.status === "PROCESSING") await enqueueFile(file.id);
    await recordAudit({ actorId: user.id, action: "FILE_UPLOAD_COMPLETED", entityType: "File", entityId: file.id, metadata: { status: file.status }, ...auditContext(request) });
    return Response.json({ fileId: file.id, status: file.status }, {
      status: file.status === "PROCESSING" ? 202 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error instanceof ObjectVerificationError ? new ApiError(409, error.message) : error);
  }
}
