import { z } from "zod";
import { apiError, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { requirePermission } from "@/modules/admin/service";

export const runtime = "nodejs";

const querySchema = z.object({
  cursor: z.string().uuid().optional(),
  action: z.string().trim().max(80).optional(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    const params = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) throw new ApiError(400, "Invalid audit query");
    const rows = await getDb().auditLog.findMany({
      where: parsed.data.action ? { action: parsed.data.action } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      ...(parsed.data.cursor ? { skip: 1, cursor: { id: parsed.data.cursor } } : {}),
      select: { id: true, action: true, entityType: true, entityId: true, metadata: true, ipAddress: true, userAgent: true, success: true, createdAt: true, actor: { select: { id: true, name: true, email: true, username: true } } },
    });
    return Response.json({ logs: rows, nextCursor: rows.length === 50 ? rows[rows.length - 1]?.id ?? null : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
