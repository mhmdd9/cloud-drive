import { apiError, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { hashShareToken } from "@/modules/sharing/links";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!token || token.length < 32 || token.length > 100) throw new ApiError(404, "Link not found");
    const link = await getDb().sharedLink.findFirst({ where: { tokenHash: hashShareToken(token), revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], file: { deletedAt: null } }, select: { permission: true, expiresAt: true, file: { select: { name: true, mimeType: true, size: true, status: true }, }, owner: { select: { name: true } } } });
    if (!link) throw new ApiError(404, "Link not found or expired");
    return Response.json({ file: { ...link.file, size: link.file.size.toString() }, permission: link.permission, expiresAt: link.expiresAt, owner: link.owner }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
