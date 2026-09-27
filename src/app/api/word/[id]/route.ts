import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import mammoth from "mammoth";
import { v7 as uuidv7 } from "uuid";
import { getDb } from "@/lib/db";
import { ApiError, apiError, assertSameOrigin, noStoreHeaders } from "@/lib/http";
import { createStorage, deleteObject, headObject } from "@/lib/storage";
import { requireUser } from "@/modules/auth/session";
import { getConfiguredMaxUploadBytes } from "@/modules/admin/settings";
import { auditContext, recordAudit } from "@/modules/audit/service";
import { createObjectKey, fileIdSchema, validVersionId, verifyObject } from "@/modules/files/validation";
import { cleanWordHtml, isWordFile, MAX_WORD_BYTES, MAX_WORD_HTML_BYTES, WORD_MIME_TYPE, wordRevision } from "@/modules/files/word";

export const runtime = "nodejs";
const HtmlToDocx = createRequire(`${process.cwd()}/package.json`)("@turbodocx/html-to-docx") as typeof import("@turbodocx/html-to-docx");

async function findWord(id: string, actorId: string) {
  if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
  const file = await getDb().file.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, ownerId: true, name: true, size: true, status: true, objectKey: true, versionId: true, encryptionMode: true,
      shares: { where: { userId: actorId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { permission: true } },
    },
  });
  if (!file || (file.ownerId !== actorId && !file.shares.length)) throw new ApiError(404, "File not found");
  if (!isWordFile(file.name)) throw new ApiError(415, "Only DOCX files can be opened here");
  if (file.encryptionMode !== "NONE") throw new ApiError(409, "Confidential files cannot be opened in the online editor");
  const versionId = file.versionId;
  if (file.status !== "READY" || !validVersionId(versionId)) throw new ApiError(409, "File is not ready");
  if (file.size > BigInt(MAX_WORD_BYTES)) throw new ApiError(413, "DOCX exceeds the online editor size limit");
  return { ...file, versionId, canEdit: file.ownerId === actorId || file.shares.some((share) => share.permission === "EDIT") };
}

async function limitedHtml(request: Request): Promise<string> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "text/html") throw new ApiError(415, "Content-Type must be text/html");
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_WORD_HTML_BYTES)) throw new ApiError(413, "Document is too large");
  if (!request.body) throw new ApiError(400, "Missing document");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_WORD_HTML_BYTES) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, "Document is too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid document encoding");
  } finally { reader.releaseLock(); }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const file = await findWord(id, actor.id);
    const storage = createStorage();
    try {
      const object = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: file.objectKey, VersionId: file.versionId }));
      if (object.ContentLength !== Number(file.size) || !object.Body) throw new ApiError(409, "Stored file is unavailable");
      const bytes = await object.Body.transformToByteArray();
      if (bytes.length !== Number(file.size)) throw new ApiError(409, "Stored file is incomplete");
      let converted: Awaited<ReturnType<typeof mammoth.convertToHtml>>;
      try { converted = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) }); }
      catch { throw new ApiError(422, "DOCX cannot be displayed"); }
      await recordAudit({ actorId: actor.id, action: "WORD_OPENED", entityType: "File", entityId: id });
      return Response.json({ name: file.name, html: cleanWordHtml(converted.value), revision: wordRevision(file.objectKey, file.versionId), canEdit: file.canEdit, isOwner: file.ownerId === actor.id, conversionWarnings: converted.messages.map((message) => message.message) }, { headers: noStoreHeaders });
    } finally { storage.client.destroy(); }
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const actor = await requireUser();
    const { id } = await context.params;
    const file = await findWord(id, actor.id);
    if (!file.canEdit) throw new ApiError(403, "Editing is not allowed");
    if (request.headers.get("if-match") !== wordRevision(file.objectKey, file.versionId)) throw new ApiError(409, "This document changed. Reload it before saving.");
    const html = cleanWordHtml(await limitedHtml(request));
    let bytes: Buffer;
    try {
      const result = await HtmlToDocx(`<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"></head><body>${html}</body></html>`);
      bytes = Buffer.from(new Uint8Array(result instanceof Blob ? await result.arrayBuffer() : result));
    } catch { throw new ApiError(422, "DOCX could not be created from this document"); }
    if (!bytes.length || bytes.length > MAX_WORD_BYTES || bytes.length > await getConfiguredMaxUploadBytes()) throw new ApiError(413, "Edited DOCX exceeds the file size limit");
    const checksum = createHash("sha256").update(bytes).digest("base64");
    const objectKey = createObjectKey(uuidv7(), checksum);
    const storage = createStorage();
    let uploadedVersion: string | null = null;
    let committed = false;
    try {
      const saved = await storage.client.send(new PutObjectCommand({ Bucket: storage.bucket, Key: objectKey, Body: bytes, ContentType: WORD_MIME_TYPE, ContentLength: bytes.length, ChecksumSHA256: checksum, ServerSideEncryption: "aws:kms", SSEKMSKeyId: storage.kmsKeyId, IfNoneMatch: "*" }));
      if (!validVersionId(saved.VersionId)) throw new Error("Storage did not return a version id");
      uploadedVersion = saved.VersionId;
      const metadata = await headObject(storage, objectKey, uploadedVersion);
      verifyObject(metadata, { size: BigInt(bytes.length), checksum, kmsKeyId: storage.kmsKeyId, versionId: uploadedVersion });
      const db = getDb();
      await db.$transaction(async (tx) => {
        if (file.ownerId !== actor.id) {
          const grant = await tx.fileShare.findFirst({ where: { fileId: id, userId: actor.id, permission: "EDIT", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
          if (!grant) throw new ApiError(403, "Editing permission expired");
        }
        const updated = await tx.file.updateMany({ where: { id, objectKey: file.objectKey, versionId: file.versionId, status: "READY", deletedAt: null, encryptionMode: "NONE" }, data: { objectKey, versionId: uploadedVersion, size: BigInt(bytes.length), mimeType: WORD_MIME_TYPE } });
        if (updated.count !== 1) throw new ApiError(409, "This document changed. Reload it before saving.");
        await tx.fileVersion.create({ data: { fileId: id, objectKey: file.objectKey, versionId: file.versionId, size: file.size, editedById: actor.id } });
      });
      committed = true;
      await recordAudit({ actorId: actor.id, action: "WORD_SAVED", entityType: "File", entityId: id, metadata: { previousVersionId: file.versionId }, ...auditContext(request) });
      return Response.json({ revision: wordRevision(objectKey, uploadedVersion) }, { headers: noStoreHeaders });
    } catch (error) {
      if (!committed && uploadedVersion) await deleteObject(storage, objectKey, uploadedVersion).catch((cleanupError) => console.error("Word save cleanup failed", cleanupError));
      throw error;
    } finally { storage.client.destroy(); }
  } catch (error) { return apiError(error); }
}
