import { z } from "zod";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { requirePermission } from "@/modules/admin/service";
import { emailSchema, passwordSchema, usernameSchema } from "@/modules/auth/identifier";
import { hashPassword } from "@/modules/auth/password";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

const updateUserSchema = z.strictObject({
  name: z.string().trim().min(1).max(120).optional(),
  email: emailSchema.optional(),
  username: usernameSchema.nullable().optional(),
  password: passwordSchema.refine((value) => value.length >= 12, "Password must be at least 12 characters").optional(),
  active: z.boolean().optional(),
  roles: z.array(z.string().trim().min(1)).min(1).max(8).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) throw new ApiError(400, "Invalid user id");
    const parsed = updateUserSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid user data");
    const input = parsed.data;
    if (id === actor.id && input.active === false) throw new ApiError(400, "You cannot deactivate your own account");
    const db = getDb();
    const existing = await db.user.findUnique({ where: { id }, select: { id: true, email: true, username: true } });
    if (!existing) throw new ApiError(404, "User not found");
    const email = input.email ?? existing.email;
    const username = input.username === undefined ? existing.username : input.username;
    const duplicate = await db.user.findFirst({ where: { OR: [{ email }, ...(username ? [{ username }] : [])], NOT: { id } }, select: { id: true } });
    if (duplicate) throw new ApiError(409, "Email or username is already in use");
    const roles = input.roles ? await db.role.findMany({ where: { name: { in: input.roles } }, select: { id: true, name: true } }) : null;
    if (roles && roles.length !== new Set(input.roles).size) throw new ApiError(400, "Unknown role");
    const user = await db.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { name: input.name, email, username, active: input.active, ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}) }, select: { id: true, name: true, email: true, username: true, active: true, createdAt: true, roles: { include: { role: { select: { name: true } } } } } });
      if (roles) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roles.map((role) => ({ userId: id, roleId: role.id })) });
      }
      return updated;
    });
    await recordAudit({ actorId: actor.id, action: "USER_UPDATED", entityType: "User", entityId: id, metadata: { changedFields: Object.keys(input), rolesChanged: Boolean(roles) }, ...auditContext(request) });
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
