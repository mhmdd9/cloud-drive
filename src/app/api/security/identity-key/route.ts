import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

const publicKeySchema = z.strictObject({
  kty: z.literal("RSA"),
  n: z.string().min(1).max(4096),
  e: z.string().min(1).max(32),
  alg: z.literal("RSA-OAEP-256"),
  ext: z.boolean().optional(),
  key_ops: z.array(z.literal("encrypt")).min(1).max(1),
});

export async function GET() {
  try {
    const user = await requireUser();
    const current = await getDb().user.findUnique({ where: { id: user.id }, select: { encryptionPublicKey: true, encryptionKeyCreatedAt: true, recoveryEncryptedPrivateKey: true, recoveryKeyCreatedAt: true, _count: { select: { files: true } } } });
    return Response.json({ publicKey: current?.encryptionPublicKey ?? null, createdAt: current?.encryptionKeyCreatedAt ?? null, recoveryConfigured: Boolean(current?.recoveryEncryptedPrivateKey), recoveryCreatedAt: current?.recoveryKeyCreatedAt ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const db = getDb();
    const confidentialFiles = await db.file.count({ where: { ownerId: user.id, encryptionMode: "CONFIDENTIAL", deletedAt: null } });
    if (confidentialFiles > 0) throw new ApiError(409, "Confidential files prevent identity reset");
    await db.user.update({ where: { id: user.id }, data: { encryptionPublicKey: Prisma.DbNull, encryptionKeyCreatedAt: null, recoveryEncryptedPrivateKey: null, recoverySalt: null, recoveryIv: null, recoveryKeyCreatedAt: null } });
    await recordAudit({ actorId: user.id, action: "DEVICE_IDENTITY_RESET", entityType: "User", entityId: user.id, ...auditContext(request) });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const parsed = z.strictObject({ publicKey: publicKeySchema }).safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid encryption public key");
    const updated = await getDb().user.updateMany({ where: { id: user.id, encryptionPublicKey: { equals: Prisma.DbNull } }, data: { encryptionPublicKey: parsed.data.publicKey, encryptionKeyCreatedAt: new Date() } });
    if (updated.count !== 1) throw new ApiError(409, "Encryption identity already exists");
    await recordAudit({ actorId: user.id, action: "DEVICE_IDENTITY_CREATED", entityType: "User", entityId: user.id, ...auditContext(request) });
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
