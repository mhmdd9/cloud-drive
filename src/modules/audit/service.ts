import "server-only";
import { getDb } from "@/lib/db";

export type AuditMetadata = Record<string, string | number | boolean | string[] | null>;

export type AuditInput = {
  actorId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: AuditMetadata;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean;
};

export function auditContext(request: Request): Pick<AuditInput, "ipAddress" | "userAgent"> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const ipAddress = (forwarded || request.headers.get("x-real-ip") || "").slice(0, 128) || null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) || null;
  return { ipAddress, userAgent };
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await getDb().auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        metadata: input.metadata,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        success: input.success ?? true,
      },
    });
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}
