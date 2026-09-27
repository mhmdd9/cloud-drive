import { requireUser } from "@/modules/auth/session";
import { getDb } from "@/lib/db";
import { ApiError, apiError, noStoreHeaders } from "@/lib/http";
import { fileIdSchema } from "@/modules/files/validation";
import { isWordFile } from "@/modules/files/word";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
    const file = await getDb().file.findFirst({ where: { id, ownerId: actor.id, deletedAt: null }, select: { name: true, encryptionMode: true } });
    if (!file) throw new ApiError(404, "File not found");
    if (!isWordFile(file.name) || file.encryptionMode !== "NONE") throw new ApiError(409, "Word history is unavailable");
    const versions = await getDb().fileVersion.findMany({ where: { fileId: id }, orderBy: { createdAt: "desc" }, select: { id: true, size: true, createdAt: true } });
    return Response.json({ versions: versions.map((version) => ({ id: version.id, size: version.size.toString(), createdAt: version.createdAt })) }, { headers: noStoreHeaders });
  } catch (error) { return apiError(error); }
}
