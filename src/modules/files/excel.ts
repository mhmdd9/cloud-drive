import "server-only";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { fileIdSchema, validVersionId } from "@/modules/files/validation";

export const MAX_EXCEL_BYTES = 25 * 1024 * 1024;
export const EXCEL_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const isExcelFile = (name: string) => name.toLowerCase().endsWith(".xlsx");

function required(name: string) {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`${name} is required`);
  return value;
}

function serviceUrl(name: string, developmentDefault: string) {
  const value = process.env[name] ?? (process.env.NODE_ENV === "production" ? undefined : developmentDefault);
  if (!value || value.trim() !== value) throw new Error(`${name} is required`);
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error(`Invalid ${name}`);
  return url.origin;
}

export function excelConfig() {
  const secret = required("ONLYOFFICE_JWT_SECRET");
  if (Buffer.byteLength(secret) < 32) throw new Error("ONLYOFFICE_JWT_SECRET must be at least 32 bytes");
  return {
    secret: new TextEncoder().encode(secret),
    publicUrl: serviceUrl("ONLYOFFICE_PUBLIC_URL", "http://localhost:8080"),
    internalUrl: serviceUrl("ONLYOFFICE_INTERNAL_URL", "http://localhost:8080"),
    appUrl: serviceUrl("ONLYOFFICE_APP_URL", "http://host.docker.internal:3000"),
  };
}

export function excelKey(id: string, objectKey: string, versionId: string) {
  return createHash("sha256").update(id).update("\0").update(objectKey).update("\0").update(versionId).digest("hex");
}

export async function findExcel(id: string, actorId: string, edit = false) {
  if (!fileIdSchema.safeParse(id).success) throw new ApiError(400, "Invalid file id");
  const file = await getDb().file.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, ownerId: true, name: true, size: true, status: true, objectKey: true, versionId: true, encryptionMode: true,
      shares: { where: { userId: actorId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { permission: true } },
    },
  });
  if (!file || (file.ownerId !== actorId && !file.shares.length)) throw new ApiError(404, "File not found");
  if (!isExcelFile(file.name)) throw new ApiError(415, "Only XLSX files can be opened here");
  if (file.encryptionMode !== "NONE") throw new ApiError(409, "Confidential files cannot be opened in the online editor");
  if (file.status !== "READY" || !validVersionId(file.versionId)) throw new ApiError(409, "File is not ready");
  if (file.size > BigInt(MAX_EXCEL_BYTES)) throw new ApiError(413, "XLSX exceeds the online editor size limit");
  const canEdit = file.ownerId === actorId || file.shares.some((share) => share.permission === "EDIT");
  if (edit && !canEdit) throw new ApiError(403, "Editing is not allowed");
  return { ...file, versionId: file.versionId, canEdit, key: excelKey(id, file.objectKey, file.versionId) };
}

export async function signExcelAccess(input: { id: string; actorId: string; key: string; purpose: "download" | "callback" }) {
  return new SignJWT({ fileId: input.id, actorId: input.actorId, key: input.key, purpose: input.purpose })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h")
    .sign(excelConfig().secret);
}

export async function verifyExcelAccess(token: string | null, id: string, purpose: "download" | "callback") {
  if (!token) throw new ApiError(401, "Missing editor token");
  try {
    const { payload } = await jwtVerify(token, excelConfig().secret, { algorithms: ["HS256"] });
    if (payload.fileId !== id || payload.purpose !== purpose || typeof payload.actorId !== "string" || !/^[a-f0-9]{64}$/.test(String(payload.key))) throw new Error("Invalid claims");
    return { actorId: payload.actorId, key: payload.key as string };
  } catch { throw new ApiError(401, "Invalid or expired editor token"); }
}
