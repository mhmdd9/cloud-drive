import { z } from "zod";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { canGrantShare, type SharePermission } from "@/modules/sharing/policy";
import { identifierSchema } from "@/modules/auth/identifier";

export const runtime = "nodejs";

const createShareSchema = z.strictObject({
  fileId: z.uuid(),
  identifier: identifierSchema,
  permission: z.enum(["VIEW", "DOWNLOAD", "EDIT"]),
  expiresAt: z.string().datetime().nullable().optional(),
});

function serializeShare(share: { id: string; permission: SharePermission; expiresAt: Date | null; file: { id: string; name: string; mimeType: string; size: bigint; status: string; owner: { name: string; email: string } }; user?: { name: string; email: string; username: string | null } | null }) {
  return { id: share.id, permission: share.permission, expiresAt: share.expiresAt, file: { ...share.file, size: share.file.size.toString() }, recipient: share.user ?? null };
}

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const view = new URL(request.url).searchParams.get("view") ?? "incoming";
    const db = getDb();
    const now = new Date();
    if (view === "outgoing") {
      const shares = await db.fileShare.findMany({ where: { file: { ownerId: actor.id, deletedAt: null }, userId: { not: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { id: "desc" }, select: { id: true, permission: true, expiresAt: true, user: { select: { name: true, email: true, username: true } }, file: { select: { id: true, name: true, mimeType: true, size: true, status: true, owner: { select: { name: true, email: true } } } } } });
      return Response.json({ shares: shares.map(serializeShare) }, { headers: { "Cache-Control": "no-store" } });
    }
    const shares = await db.fileShare.findMany({ where: { userId: actor.id, file: { deletedAt: null }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: { id: "desc" }, select: { id: true, permission: true, expiresAt: true, file: { select: { id: true, name: true, mimeType: true, size: true, status: true, owner: { select: { name: true, email: true } } } } } });
    return Response.json({ shares: shares.map(serializeShare) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const parsed = createShareSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid share data");
    const input = parsed.data;
    const db = getDb();
    const file = await db.file.findFirst({ where: { id: input.fileId, ownerId: actor.id, deletedAt: null }, select: { id: true, ownerId: true, status: true } });
    if (!file) throw new ApiError(404, "File not found");
    if (file.status !== "READY") throw new ApiError(409, "File is not ready for sharing");
    const recipient = await db.user.findFirst({ where: input.identifier.includes("@") ? { email: input.identifier, active: true } : { username: input.identifier, active: true }, select: { id: true, active: true } });
    if (!recipient) throw new ApiError(404, "Recipient not found");
    const actorSnapshot = await db.user.findUnique({ where: { id: actor.id }, select: { active: true, roles: { select: { roleId: true } }, memberships: { select: { groupId: true } } } });
    if (!actorSnapshot) throw new ApiError(401, "Authentication required");
    const memberships = await db.groupMember.findMany({ where: { userId: { in: [actor.id, recipient.id] } }, select: { userId: true, groupId: true } });
    const policies = await db.groupSharePolicy.findMany({ where: { groupId: { in: [...new Set(memberships.map((membership) => membership.groupId))] } }, select: { groupId: true, roleId: true } });
    if (!canGrantShare({ actorId: actor.id, ownerId: file.ownerId, actorActive: actorSnapshot.active, actorRoleIds: actorSnapshot.roles.map((role) => role.roleId), currentMemberships: memberships, currentPolicies: policies }, { userId: recipient.id, active: recipient.active }, input.permission)) throw new ApiError(403, "Sharing policy does not allow this recipient");
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new ApiError(400, "Expiration must be in the future");
    const existing = await db.fileShare.findFirst({ where: { fileId: input.fileId, userId: recipient.id } });
    const share = existing ? await db.fileShare.update({ where: { id: existing.id }, data: { permission: input.permission, expiresAt } }) : await db.fileShare.create({ data: { fileId: input.fileId, userId: recipient.id, permission: input.permission, expiresAt } });
    return Response.json({ share: { id: share.id, permission: share.permission, expiresAt: share.expiresAt } }, { status: existing ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
