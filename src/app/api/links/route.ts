import { z } from "zod";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { createShareToken, hashShareToken } from "@/modules/sharing/links";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

const createLinkSchema = z.strictObject({
  fileId: z.uuid(),
  permission: z.enum(["VIEW", "DOWNLOAD"]).default("DOWNLOAD"),
  expiresInHours: z.number().int().positive().max(24 * 30).default(7 * 24),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const parsed = createLinkSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid link data");
    const input = parsed.data;
    const file = await getDb().file.findFirst({ where: { id: input.fileId, ownerId: actor.id, deletedAt: null, status: "READY" }, select: { id: true, encryptionMode: true } });
    if (!file) throw new ApiError(404, "File not found or not ready");
    if (file.encryptionMode === "CONFIDENTIAL") throw new ApiError(409, "Confidential files require a named recipient");
    const token = createShareToken();
    const link = await getDb().sharedLink.create({ data: { tokenHash: hashShareToken(token), fileId: file.id, ownerId: actor.id, permission: input.permission, expiresAt: new Date(Date.now() + input.expiresInHours * 60 * 60 * 1000) }, select: { id: true, expiresAt: true, permission: true } });
    await recordAudit({ actorId: actor.id, action: "PUBLIC_LINK_CREATED", entityType: "SharedLink", entityId: link.id, metadata: { fileId: file.id, permission: input.permission, expiresInHours: input.expiresInHours }, ...auditContext(request) });
    const origin = process.env.APP_ORIGIN;
    if (!origin) throw new Error("APP_ORIGIN is required");
    return Response.json({ link: { ...link, url: `${origin}/share/${token}` } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const fileId = new URL(request.url).searchParams.get("fileId");
    if (!fileId || !z.uuid().safeParse(fileId).success) throw new ApiError(400, "Invalid file id");
    const links = await getDb().sharedLink.findMany({ where: { ownerId: actor.id, fileId }, orderBy: { createdAt: "desc" }, select: { id: true, permission: true, expiresAt: true, revokedAt: true, createdAt: true } });
    return Response.json({ links }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
