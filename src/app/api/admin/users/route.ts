import { z } from "zod";
import { apiError, assertSameOrigin, readJson, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { requirePermission } from "@/modules/admin/service";
import { emailSchema, passwordSchema, usernameSchema } from "@/modules/auth/identifier";
import { hashPassword } from "@/modules/auth/password";

export const runtime = "nodejs";

const createUserSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  username: usernameSchema.nullable().optional(),
  password: passwordSchema.refine((value) => value.length >= 12, "Password must be at least 12 characters"),
  roles: z.array(z.string().trim().min(1)).min(1).max(8),
});

function serializeUser(user: { id: string; name: string; email: string; username: string | null; active: boolean; createdAt: Date; roles: { role: { name: string } }[] }) {
  return { id: user.id, name: user.name, email: user.email, username: user.username, active: user.active, createdAt: user.createdAt, roles: user.roles.map(({ role }) => role.name) };
}

export async function GET() {
  try {
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    const users = await getDb().user.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, username: true, active: true, createdAt: true, roles: { include: { role: { select: { name: true } } } } } });
    return Response.json({ users: users.map(serializeUser) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    const parsed = createUserSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid user data");
    const input = parsed.data;
    const db = getDb();
    const duplicate = await db.user.findFirst({ where: { OR: [{ email: input.email }, ...(input.username ? [{ username: input.username }] : [])] }, select: { id: true } });
    if (duplicate) throw new ApiError(409, "Email or username is already in use");
    const roles = await db.role.findMany({ where: { name: { in: input.roles } }, select: { id: true, name: true } });
    if (roles.length !== new Set(input.roles).size) throw new ApiError(400, "Unknown role");
    const user = await db.user.create({
      data: { name: input.name, email: input.email, username: input.username ?? null, passwordHash: await hashPassword(input.password), roles: { create: roles.map((role) => ({ roleId: role.id })) } },
      select: { id: true, name: true, email: true, username: true, active: true, createdAt: true, roles: { include: { role: { select: { name: true } } } } },
    });
    return Response.json({ user: serializeUser(user) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
