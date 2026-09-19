import { apiError, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { createStorage, presignDownload } from "@/lib/storage";
import { hashShareToken } from "@/modules/sharing/links";
import { auditContext, recordAudit } from "@/modules/audit/service";
import { validVersionId } from "@/modules/files/validation";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const link = await getDb().sharedLink.findFirst({ where: { tokenHash: hashShareToken(token), revokedAt: null, permission: "DOWNLOAD", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], file: { deletedAt: null, status: "READY" } }, select: { id: true, file: { select: { name: true, objectKey: true, versionId: true } } } });
    if (!link || !validVersionId(link.file.versionId)) throw new ApiError(404, "Link not found or file is not ready");
    const storage = createStorage();
    try {
      const url = await presignDownload(storage, { objectKey: link.file.objectKey, versionId: link.file.versionId, fileName: link.file.name });
      await recordAudit({ action: "PUBLIC_LINK_DOWNLOADED", entityType: "SharedLink", entityId: link.id, ...auditContext(_request) });
      return Response.redirect(url, 302);
    } finally { storage.client.destroy(); }
  } catch (error) {
    return apiError(error);
  }
}
