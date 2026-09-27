import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { jwtVerify } from "jose";
import { v7 as uuidv7 } from "uuid";
import { getDb } from "@/lib/db";
import { ApiError, noStoreHeaders } from "@/lib/http";
import { createStorage, deleteObject, headObject } from "@/lib/storage";
import { getConfiguredMaxUploadBytes } from "@/modules/admin/settings";
import { recordAudit } from "@/modules/audit/service";
import { excelConfig, EXCEL_MIME_TYPE, findExcel, MAX_EXCEL_BYTES, verifyExcelAccess } from "@/modules/files/excel";
import { createObjectKey, validVersionId, verifyObject } from "@/modules/files/validation";

export const runtime = "nodejs";

function callbackResult(error: 0 | 1, status = 200) {
  return Response.json({ error }, { status, headers: noStoreHeaders });
}

async function limitedBody(request: Request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json") throw new ApiError(415, "Invalid callback type");
  if (!request.body) throw new ApiError(400, "Missing callback body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 128 * 1024) throw new ApiError(413, "Callback too large");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8")) as unknown;
  } finally { reader.releaseLock(); }
}

function editorDownloadUrl(value: string, internalUrl: string, publicUrl: string) {
  const url = new URL(value);
  if (![internalUrl, publicUrl].includes(url.origin) || url.username || url.password || url.hash || !url.pathname.startsWith("/cache/")) throw new ApiError(400, "Invalid editor download URL");
  return `${internalUrl}${url.pathname}${url.search}`;
}

async function editedBytes(url: string, internalUrl: string, publicUrl: string, limit: number) {
  const response = await fetch(editorDownloadUrl(url, internalUrl, publicUrl), { redirect: "manual", signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error("Editor document download failed");
  const length = response.headers.get("content-length");
  if (length && Number(length) > limit) throw new ApiError(413, "Edited XLSX exceeds limit");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ApiError(413, "Edited XLSX exceeds limit"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (bytes.length < 4 || bytes.subarray(0, 4).toString("hex") !== "504b0304") throw new ApiError(422, "Edited document is not an XLSX archive");
  return bytes;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const config = excelConfig();
    const claim = await verifyExcelAccess(new URL(request.url).searchParams.get("token"), id, "callback");
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ApiError(401, "Unsigned editor callback");
    const { payload } = await jwtVerify(authorization.slice(7), config.secret, { algorithms: ["HS256"] });
    const body = await limitedBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "Invalid callback");
    const data = body as Record<string, unknown>;
    const signed = payload.payload;
    if (!signed || typeof signed !== "object" || Array.isArray(signed)) throw new ApiError(401, "Invalid callback signature");
    const verified = signed as Record<string, unknown>;
    if (data.key !== claim.key || verified.key !== data.key || verified.status !== data.status || (data.status === 2 && verified.url !== data.url)) throw new ApiError(401, "Callback signature mismatch");
    if (data.status !== 2) return callbackResult(0);
    if (typeof data.url !== "string") throw new ApiError(400, "Missing edited document URL");
    const file = await findExcel(id, claim.actorId, true);
    if (file.key !== claim.key) throw new ApiError(409, "File changed before editor saved");
    const bytes = await editedBytes(data.url, config.internalUrl, config.publicUrl, Math.min(MAX_EXCEL_BYTES, await getConfiguredMaxUploadBytes()));
    const checksum = createHash("sha256").update(bytes).digest("base64");
    const objectKey = createObjectKey(uuidv7(), checksum);
    const storage = createStorage();
    let uploadedVersion: string | null = null;
    let committed = false;
    try {
      const saved = await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: objectKey, Body: bytes, ContentType: EXCEL_MIME_TYPE, ContentLength: bytes.length, ChecksumSHA256: checksum, ServerSideEncryption: "aws:kms", SSEKMSKeyId: storage.kmsKeyId, IfNoneMatch: "*" }));
      if (!validVersionId(saved.VersionId)) throw new Error("Storage did not return a version id");
      uploadedVersion = saved.VersionId;
      verifyObject(await headObject(storage, objectKey, uploadedVersion), { size: BigInt(bytes.length), checksum, kmsKeyId: storage.kmsKeyId, versionId: uploadedVersion });
      const db = getDb();
      await db.$transaction(async (tx) => {
        if (file.ownerId !== claim.actorId) {
          const grant = await tx.fileShare.findFirst({ where: { fileId: id, userId: claim.actorId, permission: "EDIT", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
          if (!grant) throw new ApiError(403, "Editing permission expired");
        }
        const updated = await tx.file.updateMany({ where: { id, objectKey: file.objectKey, versionId: file.versionId, status: "READY", deletedAt: null, encryptionMode: "NONE" }, data: { objectKey, versionId: uploadedVersion, size: BigInt(bytes.length), mimeType: EXCEL_MIME_TYPE } });
        if (updated.count !== 1) throw new ApiError(409, "File changed before editor saved");
        await tx.fileVersion.create({ data: { fileId: id, objectKey: file.objectKey, versionId: file.versionId, size: file.size, editedById: claim.actorId } });
      });
      committed = true;
      await recordAudit({ actorId: claim.actorId, action: "EXCEL_SAVED", entityType: "File", entityId: id, metadata: { previousVersionId: file.versionId } });
      return callbackResult(0);
    } catch (error) {
      if (!committed && uploadedVersion) await deleteObject(storage, objectKey, uploadedVersion).catch((reason) => console.error("Excel save cleanup failed", reason));
      throw error;
    } finally { storage.client.destroy(); }
  } catch (error) {
    console.error("Excel callback failed", error);
    return callbackResult(1, error instanceof ApiError ? error.status : 500);
  }
}
