import { requireUser } from "@/modules/auth/session";
import { getDb } from "@/lib/db";
import { ApiError, apiError, noStoreHeaders } from "@/lib/http";
import { createStorage, presignDownload } from "@/lib/storage";
import { auditContext, recordAudit } from "@/modules/audit/service";
import { fileIdSchema } from "@/modules/files/validation";
import { isWordFile } from "@/modules/files/word";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const actor = await requireUser();
    const { id, versionId } = await context.params;
    if (!fileIdSchema.safeParse(id).success || !fileIdSchema.safeParse(versionId).success) throw new ApiError(400, "Invalid file id");
    const file = await getDb().file.findFirst({ where: { id, ownerId: actor.id, deletedAt: null }, select: { name: true, encryptionMode: true } });
    if (!file) throw new ApiError(404, "File not found");
    if (!isWordFile(file.name) || file.encryptionMode !== "NONE") throw new ApiError(409, "Word history is unavailable");
    const version = await getDb().fileVersion.findFirst({ where: { id: versionId, fileId: id }, select: { objectKey: true, versionId: true } });
    if (!version) throw new ApiError(404, "Version not found");
    const storage = createStorage();
    try {
      const url = await presignDownload(storage, { objectKey: version.objectKey, versionId: version.versionId, fileName: file.name });
      await recordAudit({ actorId: actor.id, action: "WORD_VERSION_DOWNLOADED", entityType: "File", entityId: id, metadata: { versionId }, ...auditContext(request) });
      return new Response(null, { status: 302, headers: { ...noStoreHeaders, Location: url } });
    } finally { storage.client.destroy(); }
  } catch (error) { return apiError(error); }
}
