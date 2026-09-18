import { requireUser } from "@/modules/auth/session";
import { ApiError, apiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { fileIdSchema } from "@/modules/files/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams;
    const trash = query.get("trash") === "true";
    const cursor = query.get("cursor");
    if (query.getAll("cursor").length > 1 || (cursor !== null && !fileIdSchema.safeParse(cursor).success)) {
      throw new ApiError(400, "Invalid cursor");
    }
    const files = await getDb().file.findMany({
      where: { ownerId: user.id, ...(trash ? { deletedAt: { not: null } } : { deletedAt: null }), ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: { id: "desc" },
      take: 50,
      select: { id: true, name: true, mimeType: true, size: true, status: true, createdAt: true, updatedAt: true, deletedAt: true },
    });
    return Response.json({
      files: files.map((file) => ({ ...file, size: file.size.toString() })),
      nextCursor: files.length === 50 ? files[49].id : null,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
