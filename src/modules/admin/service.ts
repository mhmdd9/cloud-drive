import "server-only";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import type { AuthUser } from "@/modules/auth/session";

export async function requirePermission(user: AuthUser, permission: string): Promise<void> {
  const current = await getDb().user.findFirst({
    where: { id: user.id, active: true },
    select: { roles: { include: { role: true } } },
  });
  if (!current) throw new ApiError(401, "Authentication required");
  if (!current.roles.some(({ role }) => role.permissions.includes(permission))) {
    throw new ApiError(403, "Permission denied");
  }
}
