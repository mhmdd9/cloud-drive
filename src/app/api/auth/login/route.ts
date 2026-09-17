import { apiError, assertSameOrigin, noStoreHeaders, readJson } from "@/lib/http";
import { login } from "@/modules/auth/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await login(await readJson(request));
    return Response.json({ ok: true }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
