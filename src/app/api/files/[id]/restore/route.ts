import { requireUser } from "@/modules/auth/session";
import { ApiError, apiError, assertSameOrigin } from "@/lib/http";
import { getDb } from "@/lib/db";
import { fileIdSchema } from "@/modules/files/validation";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
    const result = await getDb().file.updateMany({
      where: { id, ownerId: user.id, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (result.count !== 1) throw new ApiError(404, "File not found in trash");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
