import { z } from "zod";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { requirePermission } from "@/modules/admin/service";
import { getConfiguredMaxUploadBytes, MAX_UPLOAD_SETTING } from "@/modules/admin/settings";

export const runtime = "nodejs";

const settingsSchema = z.strictObject({ maxUploadBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024) });

export async function GET() {
  try {
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    return Response.json({ maxUploadBytes: await getConfiguredMaxUploadBytes() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    const parsed = settingsSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid settings");
    await getDb().systemSetting.upsert({ where: { key: MAX_UPLOAD_SETTING }, create: { key: MAX_UPLOAD_SETTING, value: String(parsed.data.maxUploadBytes) }, update: { value: String(parsed.data.maxUploadBytes) } });
    return Response.json({ maxUploadBytes: parsed.data.maxUploadBytes }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
