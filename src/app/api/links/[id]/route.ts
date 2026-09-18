import { z } from "zod";
import { apiError, assertSameOrigin, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, "Invalid link id");
    const result = await getDb().sharedLink.updateMany({ where: { id, ownerId: actor.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) throw new ApiError(404, "Link not found");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
