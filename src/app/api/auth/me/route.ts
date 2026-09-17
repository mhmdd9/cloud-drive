import { apiError, noStoreHeaders } from "@/lib/http";
import { requireUser } from "@/modules/auth/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles: user.roles.map(({ role }) => role.name),
      },
    }, { headers: noStoreHeaders });
  } catch (error) {
    return apiError(error);
  }
}
