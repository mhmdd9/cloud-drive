import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

const recoverySchema = z.strictObject({
  encryptedPrivateKey: z.string().regex(/^[A-Za-z0-9_-]{100,12000}$/),
  salt: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
  iv: z.string().regex(/^[A-Za-z0-9_-]{12,32}$/),
});

export async function GET() {
  try {
    const user = await requireUser();
    const current = await getDb().user.findUnique({ where: { id: user.id }, select: { recoveryEncryptedPrivateKey: true, recoverySalt: true, recoveryIv: true, recoveryKeyCreatedAt: true } });
    return Response.json({ configured: Boolean(current?.recoveryEncryptedPrivateKey && current.recoverySalt && current.recoveryIv), encryptedPrivateKey: current?.recoveryEncryptedPrivateKey ?? null, salt: current?.recoverySalt ?? null, iv: current?.recoveryIv ?? null, createdAt: current?.recoveryKeyCreatedAt ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const parsed = recoverySchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid recovery key data");
    const updated = await getDb().user.updateMany({ where: { id: user.id, encryptionPublicKey: { not: Prisma.DbNull } }, data: { recoveryEncryptedPrivateKey: parsed.data.encryptedPrivateKey, recoverySalt: parsed.data.salt, recoveryIv: parsed.data.iv, recoveryKeyCreatedAt: new Date() } });
    if (updated.count !== 1) throw new ApiError(409, "Encryption identity is not configured");
    await recordAudit({ actorId: user.id, action: "RECOVERY_KEY_CREATED", entityType: "User", entityId: user.id, ...auditContext(request) });
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
