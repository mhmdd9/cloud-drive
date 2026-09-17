import {
  GetBucketVersioningCommand,
  GetPublicAccessBlockCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing or invalid ${name}`);
  return value;
}

export function storageConfig() {
  const endpoint = new URL(required("S3_ENDPOINT"));
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash
  ) throw new Error("Invalid S3 endpoint");
  return {
    endpoint: endpoint.toString(),
    region: required("S3_REGION"),
    bucket: required("S3_BUCKET"),
    kmsKeyId: required("S3_KMS_KEY_ID"),
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
  };
}

export function createStorage() {
  const config = storageConfig();
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: config.credentials,
    forcePathStyle: true,
    maxAttempts: 3,
  });
  return { client, bucket: config.bucket, kmsKeyId: config.kmsKeyId };
}

export type Storage = ReturnType<typeof createStorage>;

export async function assertUploadBucket(storage: Storage): Promise<void> {
  const [versioning, access] = await Promise.all([
    storage.client.send(new GetBucketVersioningCommand({ Bucket: storage.bucket })),
    storage.client.send(new GetPublicAccessBlockCommand({ Bucket: storage.bucket })),
  ]);
  const block = access.PublicAccessBlockConfiguration;
  if (versioning.Status !== "Enabled") throw new Error("Bucket versioning must be enabled");
  if (!block?.BlockPublicAcls || !block.IgnorePublicAcls || !block.BlockPublicPolicy || !block.RestrictPublicBuckets) {
    throw new Error("Bucket public access must be blocked");
  }
}

export async function presignUpload(storage: Storage, input: { objectKey: string; mimeType: string; size: number; checksum: string }) {
  await assertUploadBucket(storage);
  const headers = {
    "content-type": input.mimeType,
    "content-length": String(input.size),
    "x-amz-checksum-sha256": input.checksum,
    "x-amz-server-side-encryption": "aws:kms",
    "x-amz-server-side-encryption-aws-kms-key-id": storage.kmsKeyId,
    "if-none-match": "*",
  };
  const url = await getSignedUrl(storage.client, new PutObjectCommand({
    Bucket: storage.bucket,
    Key: input.objectKey,
    ContentType: input.mimeType,
    ContentLength: input.size,
    ChecksumSHA256: input.checksum,
    ServerSideEncryption: "aws:kms",
    SSEKMSKeyId: storage.kmsKeyId,
    IfNoneMatch: "*",
  }), {
    expiresIn: 300,
    signableHeaders: new Set(Object.keys(headers)),
    unhoistableHeaders: new Set(Object.keys(headers).filter((name) => name.startsWith("x-amz-"))),
  });
  return { url, headers, expiresIn: 300 };
}

export async function headObject(storage: Storage, key: string, versionId?: string) {
  return storage.client.send(new HeadObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    VersionId: versionId,
    ChecksumMode: "ENABLED",
  }));
}
