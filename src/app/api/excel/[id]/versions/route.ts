import { getDb } from "@/lib/db";
import { ApiError, apiError, noStoreHeaders } from "@/lib/http";
import { requireUser } from "@/modules/auth/session";
import { isExcelFile } from "@/modules/files/excel";
import { fileIdSchema } from "@/modules/files/validation";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await params;
    if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
    const file = await getDb().file.findFirst({ where: { id, ownerId: actor.id, deletedAt: null }, select: { name: true, encryptionMode: true } });
    if (!file) throw new ApiError(404, "File not found");
    if (!isExcelFile(file.name) || file.encryptionMode !== "NONE") throw new ApiError(409, "Excel history is unavailable");
    const versions = await getDb().fileVersion.findMany({ where: { fileId: id }, orderBy: { createdAt: "desc" }, select: { id: true, size: true, createdAt: true } });
    return Response.json({ versions: versions.map((v) => ({ id: v.id, size: v.size.toString(), createdAt: v.createdAt })) }, { headers: noStoreHeaders });
  } catch (error) { return apiError(error); }
}
