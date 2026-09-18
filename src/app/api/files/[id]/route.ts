import { requireUser } from "@/modules/auth/session";
import { ApiError, apiError, assertSameOrigin } from "@/lib/http";
import { getDb } from "@/lib/db";
import { fileIdSchema } from "@/modules/files/validation";

export const runtime = "nodejs";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { id } = await context.params;
    if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
    const result = await getDb().file.updateMany({
      where: { id, ownerId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count !== 1) throw new ApiError(404, "File not found");
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
