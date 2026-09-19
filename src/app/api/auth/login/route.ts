import { apiError, assertSameOrigin, noStoreHeaders, readJson } from "@/lib/http";
import { login } from "@/modules/auth/service";
import { requireUser } from "@/modules/auth/session";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await login(await readJson(request));
    const actor = await requireUser();
    await recordAudit({ actorId: actor.id, action: "LOGIN_SUCCESS", metadata: { method: "password" }, ...auditContext(request) });
    return Response.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    await recordAudit({ action: "LOGIN_FAILURE", success: false, metadata: { method: "password" }, ...auditContext(request) });
    return apiError(error);
  }
}
