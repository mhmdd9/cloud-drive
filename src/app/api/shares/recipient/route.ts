import { z } from "zod";
import { apiError, ApiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { identifierSchema } from "@/modules/auth/identifier";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const identifier = identifierSchema.parse(new URL(request.url).searchParams.get("identifier"));
    const recipient = await getDb().user.findFirst({ where: { id: { not: actor.id }, active: true, ...(identifier.includes("@") ? { email: identifier } : { username: identifier }) }, select: { id: true, name: true, email: true, encryptionPublicKey: true } });
    if (!recipient) throw new ApiError(404, "Recipient not found");
    if (!recipient.encryptionPublicKey) throw new ApiError(409, "Recipient has not initialized secure transfer");
    return Response.json({ recipient }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
