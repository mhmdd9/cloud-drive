import { apiError, assertSameOrigin, noStoreHeaders } from "@/lib/http";
import { deleteSession, requireUser } from "@/modules/auth/session";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser().catch(() => null);
    await deleteSession();
    if (actor) await recordAudit({ actorId: actor.id, action: "LOGOUT", ...auditContext(request) });
    return Response.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
