import { z } from "zod";
import { apiError, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { createStorage, presignDownload } from "@/lib/storage";
import { validVersionId } from "@/modules/files/validation";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(404, "Share not found");
    const share = await getDb().fileShare.findFirst({ where: { id, userId: actor.id, permission: { in: ["DOWNLOAD", "EDIT"] }, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], file: { deletedAt: null, status: "READY" } }, select: { file: { select: { name: true, objectKey: true, versionId: true } } } });
    if (!share || !validVersionId(share.file.versionId)) throw new ApiError(404, "Share not found or file is not ready");
    const storage = createStorage();
    try {
      const url = await presignDownload(storage, { objectKey: share.file.objectKey, versionId: share.file.versionId, fileName: share.file.name });
      return Response.redirect(url, 302);
    } finally { storage.client.destroy(); }
  } catch (error) {
    return apiError(error);
  }
}
