import { z } from "zod";
import { apiError, assertSameOrigin, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, "Invalid share id");
    const result = await getDb().fileShare.deleteMany({ where: { id, file: { ownerId: actor.id } } });
    if (result.count !== 1) throw new ApiError(404, "Share not found");
    await recordAudit({ actorId: actor.id, action: "FILE_SHARE_REVOKED", entityType: "FileShare", entityId: id, ...auditContext(request) });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
