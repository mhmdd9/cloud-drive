import { v7 as uuidv7 } from "uuid";
import { requireUser } from "@/modules/auth/session";
import { ApiError, apiError, assertSameOrigin, readJson } from "@/lib/http";
import { getDb } from "@/lib/db";
import { createStorage, presignUpload } from "@/lib/storage";
import { createObjectKey, uploadSchema } from "@/modules/files/validation";
import { getConfiguredMaxUploadBytes } from "@/modules/admin/settings";
import { limitUploadRequests } from "@/modules/files/rate-limit";
import { auditContext, recordAudit } from "@/modules/audit/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await limitUploadRequests(user.id);
    const parsed = uploadSchema(await getConfiguredMaxUploadBytes()).safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, "Invalid upload metadata");
    const input = parsed.data;
    if (input.encryptionMode === "CONFIDENTIAL") {
      const security = await getDb().user.findUnique({ where: { id: user.id }, select: { recoveryEncryptedPrivateKey: true } });
      if (!security?.recoveryEncryptedPrivateKey) throw new ApiError(409, "Set up a recovery key before confidential upload");
    }
    const id = uuidv7();
    const objectKey = createObjectKey(uuidv7(), input.checksum);
    const storage = createStorage();
    try {
      const upload = await presignUpload(storage, { ...input, objectKey });
      await getDb().file.create({
        data: {
          id,
          ownerId: user.id,
          name: input.name,
          mimeType: input.mimeType,
          size: BigInt(input.size),
          objectKey,
          encryptionMode: input.encryptionMode,
          encryptionIv: input.encryptionIv,
          ownerEncryptedFileKey: input.ownerEncryptedFileKey,
          originalSize: input.originalSize === undefined ? undefined : BigInt(input.originalSize),
          status: "PENDING",
        },
      });
      await recordAudit({ actorId: user.id, action: "FILE_UPLOAD_INITIATED", entityType: "File", entityId: id, metadata: { name: input.name, size: input.size, encryptionMode: input.encryptionMode }, ...auditContext(request) });
      return Response.json({ fileId: id, ...upload }, { status: 201, headers: { "Cache-Control": "no-store" } });
    } finally {
      storage.client.destroy();
    }
  } catch (error) {
    return apiError(error);
  }
}
