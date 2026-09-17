import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import { ApiError } from "../../lib/http";
import { storageConfig } from "../../lib/storage";
import { createObjectKey, type ObjectMetadata } from "./validation";

const load = createRequire(__filename);
const origin = "https://drive.example.test";
const id = "01995ba0-0000-7000-8000-000000000001";
const ownerId = "01995ba0-0000-7000-8000-000000000002";
const checksum = Buffer.alloc(32, 1).toString("base64");
const input = { name: "report.pdf", mimeType: "application/pdf", size: 100, checksum };
const objectKey = createObjectKey(id, checksum);
const metadata: ObjectMetadata = {
  ContentLength: 100,
  ChecksumSHA256: checksum,
  ServerSideEncryption: "aws:kms",
  SSEKMSKeyId: "test-kms-key",
  VersionId: "version-1",
};
type StoredFile = {
  id: string;
  ownerId: string;
  objectKey: string;
  size: bigint;
  status: "PENDING" | "PROCESSING" | "READY" | "REJECTED";
  versionId: string | null;
};

function fixture(t: TestContext) {
  const env: Record<string, string> = {
    APP_ORIGIN: origin,
    MAX_UPLOAD_BYTES: "100",
    NODE_ENV: "test",
    S3_ENDPOINT: "https://storage.example.test",
    S3_REGION: "test-region",
    S3_BUCKET: "test-bucket",
    S3_KMS_KEY_ID: "test-kms-key",
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: "test-secret-key",
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let file: StoredFile | null = { id, ownerId, objectKey, size: BigInt(100), status: "PENDING", versionId: null };
  const events: string[] = [];
  const destroy = t.mock.fn(() => { events.push("destroy"); });
  const storage = { client: { destroy }, bucket: "test-bucket", kmsKeyId: "test-kms-key" };
  const signed = { url: "https://storage.example.test/signed", headers: { "if-none-match": "*" }, expiresIn: 300 };
  const requireUser = t.mock.fn(async () => ({ id: ownerId }));
  const limitUploadRequests = t.mock.fn<(userId: string) => Promise<void>>(async () => {});
  const createStorage = t.mock.fn(() => { storageConfig(); return storage; });
  const presignUpload = t.mock.fn<(storage: unknown, input: unknown) => Promise<typeof signed>>(async () => {
    events.push("presign");
    return signed;
  });
  const headObject = t.mock.fn<(storage: unknown, key: string) => Promise<ObjectMetadata>>(async () => {
    events.push("head");
    return metadata;
  });
  const create = t.mock.fn<(args: unknown) => Promise<void>>(async () => { events.push("create"); });
  const findFirst = t.mock.fn<(args: unknown) => Promise<StoredFile | null>>(async () => file);
  const updateMany = t.mock.fn<(args: unknown) => Promise<{ count: number }>>(async () => {
    events.push("update");
    if (file) file = { ...file, status: "PROCESSING", versionId: "version-1" };
    return { count: 1 };
  });
  const getDb = t.mock.fn(() => ({ file: { create, findFirst, updateMany } }));
  const enqueueFile = t.mock.fn<(id: string) => Promise<void>>(async () => { events.push("enqueue"); });
  const replacements: Array<[string, unknown]> = [
    ["../auth/session", { requireUser }],
    ["./rate-limit", { limitUploadRequests }],
    ["../../lib/db", { getDb }],
    ["../../lib/storage", { createStorage, presignUpload, headObject }],
    ["../../lib/queue", { enqueueFile }],
  ];
  const routes = ["../../app/api/files/uploads/route", "../../app/api/files/[id]/complete/route"];
  const saved = [...replacements.map(([path]) => path), ...routes].map((path) => {
    const resolved = load.resolve(path);
    return { resolved, cached: load.cache[resolved] };
  });
  t.after(() => {
    for (const { resolved, cached } of saved) {
      if (cached) load.cache[resolved] = cached;
      else delete load.cache[resolved];
    }
  });
  for (const [path, exports] of replacements) {
    const resolved = load.resolve(path);
    const replacement = new Module(resolved);
    replacement.filename = resolved;
    replacement.loaded = true;
    replacement.exports = exports;
    load.cache[resolved] = replacement;
  }
  for (const path of routes) delete load.cache[load.resolve(path)];
  const upload = (load(routes[0]) as typeof import("../../app/api/files/uploads/route")).POST;
  const complete = (load(routes[1]) as typeof import("../../app/api/files/[id]/complete/route")).POST;
  return {
    upload, complete, requireUser, limitUploadRequests, createStorage, presignUpload,
    headObject, create, findFirst, updateMany, getDb, enqueueFile, destroy, storage, signed, events,
    setFile(value: StoredFile | null) { file = value; },
    getFile() { return file; },
  };
}

function request(body: unknown = input, requestOrigin = origin) {
  return new Request(`${origin}/api/files/uploads`, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(fileId = id) {
  return { params: Promise.resolve({ id: fileId }) };
}

async function errorResponse(response: Response, status: number, error: string) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { error });
}

for (const route of ["upload", "complete"] as const) {
  test(`${route} handler rejects foreign origins before authentication or services`, async (t) => {
    const f = fixture(t);
    const response = route === "upload"
      ? await f.upload(request(input, "https://other.example.test"))
      : await f.complete(request(input, "https://other.example.test"), context());
    await errorResponse(response, 403, "Forbidden origin");
    assert.equal(f.requireUser.mock.callCount(), 0);
    assert.equal(f.getDb.mock.callCount(), 0);
    assert.equal(f.createStorage.mock.callCount(), 0);
    assert.equal(f.enqueueFile.mock.callCount(), 0);
  });

  test(`${route} handler preserves authentication errors without contacting services`, async (t) => {
    const f = fixture(t);
    f.requireUser.mock.mockImplementation(async () => { throw new ApiError(401, "Authentication required"); });
    const response = route === "upload" ? await f.upload(request()) : await f.complete(request(), context());
    await errorResponse(response, 401, "Authentication required");
    assert.equal(f.limitUploadRequests.mock.callCount(), 0);
    assert.equal(f.getDb.mock.callCount(), 0);
    assert.equal(f.createStorage.mock.callCount(), 0);
    assert.equal(f.enqueueFile.mock.callCount(), 0);
  });
}

test("upload handler signs normalized metadata before creating an owner-scoped pending record", async (t) => {
  const f = fixture(t);
  const response = await f.upload(request({ ...input, name: " dir/report.pdf ", mimeType: "APPLICATION/PDF" }));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body, { fileId: body.fileId, ...f.signed });
  assert.match(body.fileId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(f.limitUploadRequests.mock.calls[0].arguments, [ownerId]);
  const args = f.presignUpload.mock.calls[0].arguments;
  assert.equal(args[0], f.storage);
  const signedInput = args[1] as typeof input & { objectKey: string };
  assert.match(signedInput.objectKey, /^uploads\/[0-9a-f-]{36}\/[0-9a-f]{64}$/);
  assert.equal(signedInput.objectKey.split("/")[2], Buffer.from(checksum, "base64").toString("hex"));
  assert.notEqual(signedInput.objectKey.split("/")[1], body.fileId);
  assert.deepEqual(signedInput, { ...input, name: "dir_report.pdf", objectKey: signedInput.objectKey });
  assert.deepEqual(f.create.mock.calls[0].arguments, [{ data: {
    id: body.fileId, ownerId, name: "dir_report.pdf", mimeType: input.mimeType,
    size: BigInt(100), objectKey: signedInput.objectKey, status: "PENDING",
  } }]);
  assert.deepEqual(f.events, ["presign", "create", "destroy"]);
});

for (const [label, body] of [
  ["oversized files", { ...input, size: 101 }],
  ["client-supplied owner", { ...input, ownerId }],
  ["invalid checksums", { ...input, checksum: "invalid" }],
] as const) {
  test(`upload handler rejects ${label} before storage or persistence`, async (t) => {
    const f = fixture(t);
    await errorResponse(await f.upload(request(body)), 400, "Invalid upload metadata");
    assert.equal(f.createStorage.mock.callCount(), 0);
    assert.equal(f.getDb.mock.callCount(), 0);
  });
}

test("upload handler preserves rate-limit failures without signing or persisting", async (t) => {
  const f = fixture(t);
  f.limitUploadRequests.mock.mockImplementation(async () => { throw new ApiError(429, "Upload request limit exceeded"); });
  await errorResponse(await f.upload(request()), 429, "Upload request limit exceeded");
  assert.equal(f.createStorage.mock.callCount(), 0);
  assert.equal(f.getDb.mock.callCount(), 0);
});

for (const key of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_KMS_KEY_ID", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
  test(`upload handler fails closed when ${key} is missing`, async (t) => {
    const f = fixture(t);
    delete process.env[key];
    await errorResponse(await f.upload(request()), 500, "Internal server error");
    assert.equal(f.presignUpload.mock.callCount(), 0);
    assert.equal(f.getDb.mock.callCount(), 0);
    assert.equal(f.destroy.mock.callCount(), 0);
  });
}

for (const boundary of ["presignUpload", "create"] as const) {
  test(`upload handler sanitizes ${boundary} failure and destroys storage`, async (t) => {
    const f = fixture(t);
    f[boundary].mock.mockImplementation(async () => { throw new Error("private service details"); });
    await errorResponse(await f.upload(request()), 500, "Internal server error");
    assert.equal(f.destroy.mock.callCount(), 1);
    assert.equal(f.create.mock.callCount(), boundary === "create" ? 1 : 0);
  });
}

test("completion handler validates ids before querying persistence", async (t) => {
  const f = fixture(t);
  await errorResponse(await f.complete(request(), context("invalid")), 400, "Invalid file id");
  assert.equal(f.getDb.mock.callCount(), 0);
});

test("completion handler scopes lookup to the authenticated owner and hides absent files", async (t) => {
  const f = fixture(t);
  f.setFile(null);
  await errorResponse(await f.complete(request(), context()), 404, "File not found");
  assert.deepEqual(f.findFirst.mock.calls[0].arguments, [{ where: { id, ownerId } }]);
  assert.equal(f.createStorage.mock.callCount(), 0);
  assert.equal(f.enqueueFile.mock.callCount(), 0);
});

test("completion handler verifies metadata, conditionally pins the version, rereads and enqueues", async (t) => {
  const f = fixture(t);
  const response = await f.complete(request(), context());
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { fileId: id, status: "PROCESSING" });
  assert.deepEqual(f.headObject.mock.calls[0].arguments, [f.storage, objectKey]);
  assert.deepEqual(f.updateMany.mock.calls[0].arguments, [{
    where: { id, ownerId, status: "PENDING", versionId: null },
    data: { versionId: "version-1", status: "PROCESSING" },
  }]);
  assert.equal(f.findFirst.mock.callCount(), 2);
  for (const call of f.findFirst.mock.calls) assert.deepEqual(call.arguments, [{ where: { id, ownerId } }]);
  assert.deepEqual(f.enqueueFile.mock.calls[0].arguments, [id]);
  assert.deepEqual(f.events, ["head", "update", "destroy", "enqueue"]);
});

for (const [label, changed] of [
  ["size mismatch", { ContentLength: 99 }],
  ["checksum mismatch", { ChecksumSHA256: Buffer.alloc(32, 2).toString("base64") }],
  ["wrong encryption", { ServerSideEncryption: "AES256" }],
  ["wrong KMS key", { SSEKMSKeyId: "other-key" }],
  ["missing version", { VersionId: undefined }],
  ["null version", { VersionId: "null" }],
] as const) {
  test(`completion handler rejects ${label} without updating or enqueuing`, async (t) => {
    const f = fixture(t);
    f.headObject.mock.mockImplementation(async () => ({ ...metadata, ...changed }));
    await errorResponse(await f.complete(request(), context()), 409, "Uploaded object failed verification");
    assert.equal(f.updateMany.mock.callCount(), 0);
    assert.equal(f.enqueueFile.mock.callCount(), 0);
    assert.equal(f.destroy.mock.callCount(), 1);
  });
}

for (const status of ["PROCESSING", "READY", "REJECTED"] as const) {
  test(`completion handler handles existing ${status} without rechecking storage`, async (t) => {
    const f = fixture(t);
    f.setFile({ ...f.getFile()!, status, versionId: "version-1" });
    const response = await f.complete(request(), context());
    if (status === "REJECTED") await errorResponse(response, 409, "File was rejected");
    else {
      assert.equal(response.status, status === "PROCESSING" ? 202 : 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.deepEqual(await response.json(), { fileId: id, status });
    }
    assert.equal(f.createStorage.mock.callCount(), 0);
    assert.equal(f.updateMany.mock.callCount(), 0);
    assert.equal(f.enqueueFile.mock.callCount(), status === "PROCESSING" ? 1 : 0);
  });
}

test("completion handler uses reread state after losing the conditional update", async (t) => {
  const f = fixture(t);
  f.updateMany.mock.mockImplementation(async () => {
    f.setFile({ ...f.getFile()!, status: "READY", versionId: "concurrent-version" });
    return { count: 0 };
  });
  const response = await f.complete(request(), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { fileId: id, status: "READY" });
  assert.equal(f.enqueueFile.mock.callCount(), 0);
  assert.equal(f.destroy.mock.callCount(), 1);
});

for (const boundary of ["headObject", "updateMany"] as const) {
  test(`completion handler sanitizes ${boundary} failure and destroys storage`, async (t) => {
    const f = fixture(t);
    f[boundary].mock.mockImplementation(async () => { throw new Error("private service details"); });
    await errorResponse(await f.complete(request(), context()), 500, "Internal server error");
    assert.equal(f.destroy.mock.callCount(), 1);
    assert.equal(f.enqueueFile.mock.callCount(), 0);
  });
}

test("completion handler retries enqueue after queue failure without rechecking or repinning the object", async (t) => {
  const f = fixture(t);
  f.enqueueFile.mock.mockImplementationOnce(async () => { throw new Error("private queue details"); });
  await errorResponse(await f.complete(request(), context()), 500, "Internal server error");
  assert.equal(f.getFile()?.status, "PROCESSING");
  assert.equal(f.getFile()?.versionId, "version-1");
  const response = await f.complete(request(), context());
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { fileId: id, status: "PROCESSING" });
  assert.equal(f.headObject.mock.callCount(), 1);
  assert.equal(f.updateMany.mock.callCount(), 1);
  assert.equal(f.destroy.mock.callCount(), 1);
  assert.equal(f.enqueueFile.mock.callCount(), 2);
});
