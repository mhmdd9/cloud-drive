import { z } from "zod";

export const fileIdSchema = z.uuid();
export const checksumSchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/).refine((value) => {
  const bytes = Buffer.from(value, "base64");
  return bytes.length === 32 && bytes.toString("base64") === value;
});

export function uploadSchema(maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Invalid MAX_UPLOAD_BYTES");
  }
  return z.strictObject({
    name: z.string().min(1).max(255).transform((value) => value.normalize("NFKC").replace(/[\p{Cc}\p{Cf}/\\:<>"|?*]/gu, "_").trim()).pipe(z.string().min(1).max(255).refine((value) => !/^\.+$/.test(value))),
    mimeType: z.string().max(127).regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/).transform((value) => value.toLowerCase()),
    size: z.number().int().positive().max(maxBytes).refine(Number.isSafeInteger),
    checksum: checksumSchema,
    encryptionMode: z.enum(["NONE", "CONFIDENTIAL"]).default("NONE"),
    encryptionIv: z.string().regex(/^[A-Za-z0-9_-]{16}$/).optional(),
    ownerEncryptedFileKey: z.string().regex(/^[A-Za-z0-9_-]{342,700}$/).optional(),
    originalSize: z.number().int().positive().max(maxBytes).refine(Number.isSafeInteger).optional(),
  }).superRefine((value, context) => {
    if (value.encryptionMode === "CONFIDENTIAL" && (!value.encryptionIv || !value.ownerEncryptedFileKey || value.originalSize === undefined)) {
      context.addIssue({ code: "custom", message: "Confidential uploads require encryption metadata" });
    }
    if (value.encryptionMode === "NONE" && (value.encryptionIv || value.ownerEncryptedFileKey || value.originalSize !== undefined)) {
      context.addIssue({ code: "custom", message: "Plain uploads cannot contain encryption metadata" });
    }
  });
}

export function maxUploadBytes(value = process.env.MAX_UPLOAD_BYTES): number {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new Error("Invalid MAX_UPLOAD_BYTES");
  }
  return Number(value);
}

export function createObjectKey(id: string, checksum: string): string {
  return `uploads/${fileIdSchema.parse(id)}/${Buffer.from(checksumSchema.parse(checksum), "base64").toString("hex")}`;
}

export function checksumFromObjectKey(key: string): string {
  const match = /^uploads\/([0-9a-f-]{36})\/([0-9a-f]{64})$/.exec(key);
  if (!match || !fileIdSchema.safeParse(match[1]).success) throw new Error("Invalid stored object key");
  return Buffer.from(match[2], "hex").toString("base64");
}

export function validVersionId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 && value !== "null" && value.trim() === value && !/[\p{Cc}\p{Cf}]/u.test(value);
}

export type ObjectMetadata = {
  ContentLength?: number;
  ChecksumSHA256?: string;
  ServerSideEncryption?: string;
  SSEKMSKeyId?: string;
  VersionId?: string;
};

export class ObjectVerificationError extends Error {
  constructor() {
    super("Uploaded object failed verification");
    this.name = "ObjectVerificationError";
  }
}

export function verifyObject(metadata: ObjectMetadata, expected: { size: bigint; checksum: string; kmsKeyId: string; versionId?: string }): string {
  if (
    !Number.isSafeInteger(metadata.ContentLength) ||
    BigInt(metadata.ContentLength ?? -1) !== expected.size ||
    metadata.ChecksumSHA256 !== expected.checksum ||
    !checksumSchema.safeParse(metadata.ChecksumSHA256).success ||
    metadata.ServerSideEncryption !== "aws:kms" ||
    !expected.kmsKeyId || metadata.SSEKMSKeyId !== expected.kmsKeyId ||
    !validVersionId(metadata.VersionId) ||
    (expected.versionId !== undefined && metadata.VersionId !== expected.versionId)
  ) throw new ObjectVerificationError();
  return metadata.VersionId;
}
