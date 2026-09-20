import { z } from "zod";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { requirePermission } from "@/modules/admin/service";
import { getConfiguredMaxUploadBytes, getConfiguredTrashRetentionDays, MAX_UPLOAD_SETTING, TRASH_RETENTION_SETTING } from "@/modules/admin/settings";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

const settingsSchema = z.strictObject({ maxUploadBytes: z.number().int().positive().max(10 * 1024 * 1024 * 1024), trashRetentionDays: z.number().int().min(1).max(3650).default(30) });

export async function GET() {
  try {
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    return Response.json({ maxUploadBytes: await getConfiguredMaxUploadBytes(), trashRetentionDays: await getConfiguredTrashRetentionDays() }, { headers: { "Cache-Control": "no-store" } });
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
    await getDb().systemSetting.upsert({ where: { key: TRASH_RETENTION_SETTING }, create: { key: TRASH_RETENTION_SETTING, value: String(parsed.data.trashRetentionDays) }, update: { value: String(parsed.data.trashRetentionDays) } });
    await recordAudit({ actorId: actor.id, action: "SETTING_UPDATED", entityType: "SystemSetting", entityId: MAX_UPLOAD_SETTING, metadata: { maxUploadBytes: parsed.data.maxUploadBytes, trashRetentionDays: parsed.data.trashRetentionDays }, ...auditContext(request) });
    return Response.json({ maxUploadBytes: parsed.data.maxUploadBytes, trashRetentionDays: parsed.data.trashRetentionDays }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
