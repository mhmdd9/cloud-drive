import { requireUser } from "@/modules/auth/session";
import { ApiError, apiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { createStorage, presignDownload } from "@/lib/storage";
import { fileIdSchema, validVersionId } from "@/modules/files/validation";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
    const file = await getDb().file.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
      select: { name: true, objectKey: true, versionId: true, status: true },
    });
    if (!file) throw new ApiError(404, "File not found");
    if (file.status !== "READY" || !validVersionId(file.versionId)) {
      throw new ApiError(409, "File is not ready for download");
    }
    const storage = createStorage();
    try {
      const url = await presignDownload(storage, {
        objectKey: file.objectKey,
        versionId: file.versionId,
        fileName: file.name,
      });
      return Response.redirect(url, 302);
    } finally {
      storage.client.destroy();
    }
  } catch (error) {
    return apiError(error);
  }
}
