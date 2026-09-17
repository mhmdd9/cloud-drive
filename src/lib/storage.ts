import {
  GetBucketAclCommand,
  GetBucketPolicyCommand,
  GetBucketVersioningCommand,
  GetPublicAccessBlockCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing or invalid ${name}`);
  return value;
}

function storageEndpoint(value: string): string {
  let endpoint: URL;
  try {
    endpoint = new URL(value);
  } catch {
    throw new Error("Invalid S3 endpoint");
  }
  if (
    !["http:", "https:"].includes(endpoint.protocol) ||
    (process.env.NODE_ENV === "production" && endpoint.protocol !== "https:") ||
    endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
    /[\s\u0000-\u001f\u007f]/u.test(value) || value.includes("?") || value.includes("#")
  ) throw new Error("Invalid S3 endpoint");
  return endpoint.toString();
}

export function storageConfig() {
  const provider = process.env.S3_PROVIDER ?? "aws";
  if (provider !== "aws" && provider !== "minio") throw new Error("Invalid S3_PROVIDER");
  const endpoint = storageEndpoint(required("S3_ENDPOINT"));
  const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT === undefined
    ? endpoint
    : storageEndpoint(required("S3_PUBLIC_ENDPOINT"));
  return {
    provider: provider as "aws" | "minio",
    endpoint,
    publicEndpoint,
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
  return { client, provider: config.provider, publicEndpoint: config.publicEndpoint, bucket: config.bucket, kmsKeyId: config.kmsKeyId };
}

export type Storage = ReturnType<typeof createStorage>;

async function assertNoBucketPolicy(storage: Storage): Promise<void> {
  try {
    await storage.client.send(new GetBucketPolicyCommand({ Bucket: storage.bucket }));
  } catch (error) {
    if (error instanceof S3ServiceException && error.name === "NoSuchBucketPolicy" && error.$metadata.httpStatusCode === 404) return;
    throw error;
  }
  throw new Error("MinIO bucket must not have a policy");
}

export async function assertUploadBucket(storage: Storage): Promise<void> {
  if (storage.provider === "minio") {
    const [versioning, acl] = await Promise.all([
      storage.client.send(new GetBucketVersioningCommand({ Bucket: storage.bucket })),
      storage.client.send(new GetBucketAclCommand({ Bucket: storage.bucket })),
      assertNoBucketPolicy(storage),
    ]);
    if (versioning.Status !== "Enabled") throw new Error("Bucket versioning must be enabled");
    const grant = acl.Grants?.[0];
    if (
      acl.Grants?.length !== 1 || grant?.Permission !== "FULL_CONTROL" ||
      grant.Grantee?.Type !== "CanonicalUser" ||
      grant.Grantee.URI !== undefined || grant.Grantee.EmailAddress !== undefined
    ) throw new Error("MinIO bucket ACL must be private");
    return;
  }
  if (storage.provider !== "aws") throw new Error("Invalid S3_PROVIDER");
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
  const signer = new S3Client({
    endpoint: storage.publicEndpoint,
    region: storage.client.config.region,
    credentials: storage.client.config.credentials,
    forcePathStyle: true,
    maxAttempts: 3,
  });
  try {
    const url = await getSignedUrl(signer, new PutObjectCommand({
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
  } finally {
    signer.destroy();
  }
}

export async function headObject(storage: Storage, key: string, versionId?: string) {
  return storage.client.send(new HeadObjectCommand({
    Bucket: storage.bucket,
    Key: key,
    VersionId: versionId,
    ChecksumMode: "ENABLED",
  }));
}
