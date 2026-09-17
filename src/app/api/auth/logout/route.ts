import { apiError, assertSameOrigin, noStoreHeaders } from "@/lib/http";
import { deleteSession } from "@/modules/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteSession();
    return Response.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
