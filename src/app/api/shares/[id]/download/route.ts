import { z } from "zod";
import { apiError, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { createStorage, presignDownload } from "@/lib/storage";
import { validVersionId } from "@/modules/files/validation";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(404, "Share not found");
    const share = await getDb().fileShare.findFirst({ where: { id, userId: actor.id, permission: { in: ["DOWNLOAD", "EDIT"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], file: { deletedAt: null, status: "READY" } }, select: { encryptedFileKey: true, file: { select: { name: true, mimeType: true, objectKey: true, versionId: true, encryptionMode: true, encryptionIv: true, originalSize: true } } } });
    if (!share || !validVersionId(share.file.versionId)) throw new ApiError(404, "Share not found or file is not ready");
    const storage = createStorage();
    try {
      const url = await presignDownload(storage, { objectKey: share.file.objectKey, versionId: share.file.versionId, fileName: share.file.name });
      await recordAudit({ actorId: actor.id, action: "SHARED_FILE_DOWNLOADED", entityType: "FileShare", entityId: id, metadata: { fileId: share.file.name, encryptionMode: share.file.encryptionMode }, ...auditContext(request) });
      if (share.file.encryptionMode === "CONFIDENTIAL") {
        if (!share.file.encryptionIv || !share.encryptedFileKey) throw new ApiError(409, "Confidential file key is unavailable");
        return Response.json({ encrypted: true, url, name: share.file.name, mimeType: share.file.mimeType, iv: share.file.encryptionIv, encryptedFileKey: share.encryptedFileKey, originalSize: share.file.originalSize?.toString() ?? null }, { headers: { "Cache-Control": "no-store" } });
      }
      return Response.redirect(url, 302);
    } finally { storage.client.destroy(); }
  } catch (error) {
    return apiError(error);
  }
}
