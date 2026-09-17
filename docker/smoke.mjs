import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { createInterface } from "node:readline/promises";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

setDefaultResultOrder("ipv4first");

class SmokeError extends Error {}

function check(condition, message) {
  if (!condition) throw new SmokeError(message);
}

function required(name) {
  const value = process.env[name];
  check(Boolean(value), `Missing ${name}`);
  return value;
}

function localUrl(value) {
  const url = new URL(value);
  check(["localhost", "127.0.0.1"].includes(url.hostname), "Expected a local Docker endpoint");
  check(["http:", "https:"].includes(url.protocol) && !url.username && !url.password, "Invalid local endpoint");
  return url;
}

async function request(url, options, statuses) {
  const response = await fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!statuses.includes(response.status)) {
    await response.body?.cancel();
    throw new SmokeError(`Unexpected HTTP status ${response.status}; expected ${statuses.join("/")}`);
  }
  return response;
}

function verifyMetadata(metadata, expected) {
  check(metadata.ContentLength === expected.size, "Object size mismatch");
  check(metadata.ChecksumSHA256 === expected.checksum, "SHA256 metadata mismatch");
  check(metadata.ServerSideEncryption === "aws:kms", "Object encryption is not aws:kms");
  check(metadata.SSEKMSKeyId === expected.kmsKeyId, "KMS key mismatch");
  check(typeof metadata.VersionId === "string" && metadata.VersionId.length > 0 && metadata.VersionId !== "null", "Missing object version");
  if (expected.versionId) check(metadata.VersionId === expected.versionId, "Object version mismatch");
}

function report(error, stage) {
  const status = error?.$metadata?.httpStatusCode;
  const networkCode = error?.cause?.code;
  const knownCodes = ["ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "ETIMEDOUT"];
  const detail = error instanceof SmokeError ? error.message
    : Number.isInteger(status) ? `S3 HTTP ${status}`
      : knownCodes.includes(networkCode) ? networkCode
        : error?.name === "TimeoutError" || error?.name === "AbortError" ? "Request timed out"
          : "Operation failed; raw error suppressed to protect credentials and signed URLs";
  console.error(`FAIL stage=${stage}: ${detail}`);
  process.exitCode = 1;
}

let stage = "configuration";
let cookie;
let client;
let origin;
let fileId;

function log(status) {
  console.log(`smoke${fileId ? ` id=${fileId}` : ""} status=${status}`);
}

async function api(path, method = "GET", body, statuses = [200]) {
  return request(new URL(path, origin), {
    method,
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, statuses);
}

try {
  const loaded = config({ path: new URL("../.env", import.meta.url), quiet: true });
  check(!loaded.error, "Unable to load workspace .env");
  check(process.argv.slice(2).every((arg) => arg === "--pause-before-readback"), "Only --pause-before-readback is supported");
  origin = localUrl(required("APP_ORIGIN")).origin;
  const endpoint = localUrl(process.env.S3_PUBLIC_ENDPOINT || required("S3_ENDPOINT"));
  const bucket = required("S3_BUCKET");
  client = new S3Client({
    endpoint: endpoint.origin,
    region: required("S3_REGION"),
    credentials: {
      accessKeyId: required("S3_ACCESS_KEY_ID"),
      secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
    maxAttempts: 3,
  });

  stage = "login";
  const login = await api("/api/auth/login", "POST", {
    identifier: required("ADMIN_USERNAME"),
    password: required("ADMIN_PASSWORD"),
  });
  const session = login.headers.getSetCookie().find((value) => value.startsWith("clouddrive_session="));
  check(Boolean(session), "Login did not return session cookie");
  cookie = session.split(";", 1)[0];
  check((await login.json()).ok === true, "Login response invalid");
  stage = "me";
  const me = await (await api("/api/auth/me")).json();
  check(typeof me.user?.id === "string", "Authenticated user missing");
  log("authenticated");

  const bytes = Buffer.concat([Buffer.from(`clouddrive-smoke:${randomUUID()}\n`), randomBytes(32)]);
  const checksum = createHash("sha256").update(bytes).digest("base64");
  stage = "upload-url";
  const upload = await (await api("/api/files/uploads", "POST", {
    name: `smoke-${randomUUID()}.bin`,
    mimeType: "application/octet-stream",
    size: bytes.length,
    checksum,
  }, [201])).json();
  check(typeof upload.fileId === "string" && /^[0-9a-f-]{36}$/.test(upload.fileId), "Invalid upload file ID");
  fileId = upload.fileId;
  log("PENDING");
  const uploadUrl = localUrl(upload.url);
  check(uploadUrl.origin === endpoint.origin, "Upload endpoint differs from host S3 endpoint");
  const prefix = `/${bucket}/`;
  check(uploadUrl.pathname.startsWith(prefix), "Upload bucket mismatch");
  const key = decodeURIComponent(uploadUrl.pathname.slice(prefix.length));
  check(/^uploads\/[0-9a-f-]{36}\/[0-9a-f]{64}$/.test(key), "Invalid upload object key");
  check(key.endsWith(createHash("sha256").update(bytes).digest("hex")), "Object key checksum mismatch");
  const headers = new Headers(upload.headers);
  check(headers.get("x-amz-checksum-sha256") === checksum, "Upload checksum header mismatch");
  check(headers.get("x-amz-server-side-encryption") === "aws:kms", "Upload does not require aws:kms");
  check(headers.get("if-none-match") === "*", "Upload must prevent overwrite");
  const kmsKeyId = headers.get("x-amz-server-side-encryption-aws-kms-key-id");
  check(kmsKeyId === "arn:aws:kms:clouddrive-dev", "Upload KMS key differs from canonical Compose key");

  stage = "cors";
  const requestedHeaders = [...headers.keys()].filter((name) => name !== "content-length");
  const preflight = await request(uploadUrl, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": requestedHeaders.join(","),
    },
  }, [200, 204]);
  check(preflight.headers.get("access-control-allow-origin") === origin, "CORS allowed origin mismatch");
  const allowedMethods = (preflight.headers.get("access-control-allow-methods") || "").split(",").map((value) => value.trim().toUpperCase());
  check(allowedMethods.includes("PUT"), "CORS does not allow PUT");
  const allowedHeaders = (preflight.headers.get("access-control-allow-headers") || "").toLowerCase().split(",").map((value) => value.trim());
  check(requestedHeaders.every((name) => allowedHeaders.includes(name)), "CORS missing required upload headers");
  await preflight.body?.cancel();
  log("cors-passed");

  stage = "put";
  headers.set("Origin", origin);
  const put = await request(uploadUrl, { method: "PUT", headers, body: bytes }, [200]);
  const putVersion = put.headers.get("x-amz-version-id");
  await put.body?.cancel();

  stage = "complete";
  const complete = await (await api(`/api/files/${fileId}/complete`, "POST", undefined, [200, 202])).json();
  check(complete.fileId === fileId && ["PROCESSING", "READY"].includes(complete.status), "Invalid completion response");
  stage = "poll-ready";
  const deadline = Date.now() + 120000;
  let ready = false;
  let previousStatus;
  while (Date.now() < deadline && !ready) {
    let cursor;
    do {
      const page = await (await api(`/api/files${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`)).json();
      check(Array.isArray(page.files), "Invalid files response");
      const file = page.files.find((item) => item.id === fileId);
      if (file) {
        check(["PENDING", "PROCESSING", "READY", "REJECTED"].includes(file.status), "Unknown file status");
        if (file.status !== previousStatus) log(file.status);
        previousStatus = file.status;
        check(file.status !== "REJECTED", "Worker rejected smoke upload");
        check(file.size === String(bytes.length), "File record size mismatch");
        ready = file.status === "READY";
        break;
      }
      const next = page.nextCursor;
      check(next == null || (typeof next === "string" && /^[0-9a-f-]{36}$/.test(next) && (!cursor || next < cursor)), "Invalid pagination cursor");
      cursor = next;
    } while (cursor && Date.now() < deadline);
    if (!ready) await delay(1000);
  }
  check(ready, "Timed out waiting for READY");

  const expected = { size: bytes.length, checksum, kmsKeyId };
  const object = { Bucket: bucket, Key: key, ChecksumMode: "ENABLED" };
  stage = "head";
  const head = await client.send(new HeadObjectCommand(object), { abortSignal: AbortSignal.timeout(30000) });
  verifyMetadata(head, expected);
  if (putVersion) check(head.VersionId === putVersion, "HEAD differs from PUT version");
  expected.versionId = head.VersionId;

  async function readback() {
    const result = await client.send(new GetObjectCommand({ ...object, VersionId: expected.versionId }), { abortSignal: AbortSignal.timeout(30000) });
    try {
      verifyMetadata(result, expected);
      check(Boolean(result.Body), "GetObject body missing");
      const chunks = [];
      let length = 0;
      for await (const chunk of result.Body) {
        length += chunk.length;
        check(length <= bytes.length, "GetObject body exceeds expected size");
        chunks.push(Buffer.from(chunk));
      }
      const actual = Buffer.concat(chunks);
      check(actual.equals(bytes), "GetObject byte mismatch");
      check(createHash("sha256").update(actual).digest("base64") === checksum, "GetObject SHA256 mismatch");
    } finally {
      result.Body?.destroy();
    }
  }

  stage = "versioned-get";
  await readback();
  log("versioned-readback-passed");
  if (process.argv.includes("--pause-before-readback")) {
    stage = "restart-wait";
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try {
      log("awaiting-external-minio-restart");
      const answer = await input.question("", { signal: AbortSignal.timeout(120000) });
      check(answer === "restarted", "Expected external restart confirmation");
    } finally {
      input.close();
    }
    stage = "post-restart-versioned-get";
    await readback();
    log("post-restart-readback-passed");
  }
} catch (error) {
  report(error, stage);
} finally {
  if (cookie) {
    try {
      await api("/api/auth/logout", "POST");
      const revoked = await api("/api/auth/me", "GET", undefined, [401]);
      await revoked.body?.cancel();
      cookie = undefined;
      const anonymous = await api("/api/auth/me", "GET", undefined, [401]);
      await anonymous.body?.cancel();
      log("logout-me401-passed");
    } catch (error) {
      report(error, "logout-me401");
    }
  }
  client?.destroy();
}

if (!process.exitCode) log("PASS-upload-retained");
