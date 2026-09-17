import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test, { type TestContext } from "node:test";
import { S3Client } from "@aws-sdk/client-s3";
import { assertUploadBucket, createStorage, headObject, presignUpload, storageConfig } from "../../lib/storage";
import { verifyObject } from "./validation";

const kmsKeyId = "arn:aws:kms:clouddrive-dev";
const secret = "test-secret-key";
const input = { objectKey: "uploads/test/file", mimeType: "application/pdf", size: 100, checksum: Buffer.alloc(32, 1).toString("base64") };
const flags = ["BlockPublicAcls", "IgnorePublicAcls", "BlockPublicPolicy", "RestrictPublicBuckets"];
const grant = '<Grant><Grantee xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="CanonicalUser"><Type>CanonicalUser</Type></Grantee><Permission>FULL_CONTROL</Permission></Grant>';
const acl = (grants = grant) => `<AccessControlPolicy><Owner></Owner><AccessControlList>${grants}</AccessControlList></AccessControlPolicy>`;
const block = (values: Record<string, string> = {}) => `<PublicAccessBlockConfiguration>${flags.map((flag) => `<${flag}>${values[flag] ?? "true"}</${flag}>`).join("")}</PublicAccessBlockConfiguration>`;
const versioning = (status = "Enabled") => `<VersioningConfiguration><Status>${status}</Status></VersioningConfiguration>`;
type Reply = { statusCode: number; body: string; headers?: Record<string, string> };
type RequestShape = { hostname: string; method: string; path: string; query: Record<string, unknown>; headers: Record<string, string> };
const ok = (body: string): Reply => ({ statusCode: 200, body });
const failure = (code: string, statusCode = 403): Reply => ({ statusCode, body: `<Error><Code>${code}</Code><Message>Storage error</Message></Error>` });

function environment(t: TestContext, overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = {
    NODE_ENV: "test",
    S3_PROVIDER: undefined,
    S3_ENDPOINT: "https://backend.example.test",
    S3_PUBLIC_ENDPOINT: undefined,
    S3_REGION: "us-east-1",
    S3_BUCKET: "test-bucket",
    S3_KMS_KEY_ID: kmsKeyId,
    S3_ACCESS_KEY_ID: "test-access-key",
    S3_SECRET_ACCESS_KEY: secret,
    ...overrides,
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

function fixture(t: TestContext, provider = "minio", overrides: Record<string, string | undefined> = {}) {
  environment(t, { S3_PROVIDER: provider, ...overrides });
  const storage = createStorage();
  const replies: Record<string, Reply | Error> = {
    versioning: ok(versioning()),
    acl: ok(acl()),
    policy: failure("NoSuchBucketPolicy", 404),
    publicAccessBlock: ok(block()),
    HEAD: { statusCode: 200, body: "", headers: {
      "content-length": String(input.size),
      "x-amz-checksum-sha256": input.checksum,
      "x-amz-server-side-encryption": "aws:kms",
      "x-amz-server-side-encryption-aws-kms-key-id": kmsKeyId,
      "x-amz-version-id": "version-1",
    } },
  };
  const requests: RequestShape[] = [];
  t.mock.method(storage.client.config, "maxAttempts", async () => 1);
  t.mock.method(storage.client.config.requestHandler, "handle", async (request: RequestShape) => {
    requests.push(request);
    const operation = request.method === "HEAD" ? "HEAD" : Object.keys(replies).find((key) => key in request.query);
    assert.ok(operation, "Unexpected storage request");
    const reply = replies[operation];
    if (reply instanceof Error) throw reply;
    return { response: { statusCode: reply.statusCode, headers: { "content-type": "application/xml", ...reply.headers }, body: Buffer.from(reply.body) } };
  });
  t.after(() => storage.client.destroy());
  return { storage, replies, requests };
}

function signature(url: URL, headers: Record<string, string>) {
  const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const query = [...url.searchParams].filter(([key]) => key !== "X-Amz-Signature").map(([key, value]) => [encode(key), encode(value)]).sort(([a, av], [b, bv]) => a < b ? -1 : a > b ? 1 : av < bv ? -1 : av > bv ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("&");
  const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders")!;
  const allHeaders = { ...headers, host: url.host };
  const canonicalHeaders = signedHeaders.split(";").map((key) => `${key}:${allHeaders[key as keyof typeof allHeaders]}\n`).join("");
  const canonical = ["PUT", url.pathname, query, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const scope = url.searchParams.get("X-Amz-Credential")!.split("/").slice(1);
  let key = Buffer.from(`AWS4${secret}`);
  for (const part of scope) key = Buffer.from(createHmac("sha256", key).update(part).digest());
  return createHmac("sha256", key).update(["AWS4-HMAC-SHA256", url.searchParams.get("X-Amz-Date"), scope.join("/"), createHash("sha256").update(canonical).digest("hex")].join("\n")).digest("hex");
}

test("configuration defaults to AWS and the backend endpoint", (t) => {
  environment(t);
  const config = storageConfig();
  assert.equal(config.provider, "aws");
  assert.equal(config.publicEndpoint, config.endpoint);
  assert.equal(config.kmsKeyId, kmsKeyId);
});

for (const provider of ["", "MINIO", "other", " minio", "aws "]) {
  test(`configuration rejects unknown provider ${JSON.stringify(provider)}`, (t) => {
    environment(t, { S3_PROVIDER: provider });
    assert.throws(storageConfig, /Invalid S3_PROVIDER/);
  });
}

for (const name of ["S3_ENDPOINT", "S3_PUBLIC_ENDPOINT"]) {
  for (const value of ["", " https://example.test", "not-a-url", "ftp://example.test", "https://user:password@example.test", "https://user@example.test", "https://example.test?token=secret", "https://example.test#fragment", "https://example.test?", "https://example.test#", "https://exam\nple.test"]) {
    test(`${name} rejects invalid endpoint ${JSON.stringify(value)}`, (t) => {
      environment(t, { [name]: value });
      assert.throws(storageConfig);
    });
  }
  test(`production requires HTTPS for ${name}`, (t) => {
    environment(t, { NODE_ENV: "production", [name]: "http://example.test" });
    assert.throws(storageConfig, /Invalid S3 endpoint/);
  });
}

for (const name of ["S3_ENDPOINT", "S3_REGION", "S3_BUCKET", "S3_KMS_KEY_ID", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
  for (const value of [undefined, "", " invalid "]) {
    test(`configuration rejects missing or padded ${name}: ${JSON.stringify(value)}`, (t) => {
      environment(t, { [name]: value });
      assert.throws(storageConfig);
    });
  }
}

test("MinIO permits HTTP only outside production and retains the exact configured KMS key", (t) => {
  environment(t, { S3_PROVIDER: "minio", S3_ENDPOINT: "http://minio:9000", S3_PUBLIC_ENDPOINT: "http://localhost:9000" });
  const config = storageConfig();
  assert.equal(config.provider, "minio");
  assert.equal(config.endpoint, "http://minio:9000/");
  assert.equal(config.publicEndpoint, "http://localhost:9000/");
  assert.equal(config.kmsKeyId, kmsKeyId);
});

test("MinIO verifies no policy, the ownerless canonical ACL stub and enabled versioning", async (t) => {
  const f = fixture(t);
  await assertUploadBucket(f.storage);
  assert.equal(f.requests.length, 3);
  assert.ok(f.requests.every((request) => request.hostname === "backend.example.test" && request.method === "GET"));
  assert.deepEqual(f.requests.map((request) => Object.keys(request.query)[0]).sort(), ["acl", "policy", "versioning"]);
});

for (const body of ["", "{}", "null", "not-json", '{"Version":"2012-10-17","Statement":[]}', '{"Statement":[{"Effect":"Deny","Principal":"*","Action":"s3:*","Resource":"*"}]}', '{"Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"*"}]}']) {
  test(`MinIO rejects any successful policy response: ${body}`, async (t) => {
    const f = fixture(t);
    f.replies.policy = ok(body);
    await assert.rejects(presignUpload(f.storage, input), /must not have a policy/);
  });
}

for (const [code, status] of [["AccessDenied", 403], ["NoSuchBucket", 404], ["NotFound", 404], ["NotImplemented", 501], ["InternalError", 500], ["NoSuchBucketPolicy", 403], ["", 404]] as const) {
  test(`MinIO fails closed on policy error ${code}/${status}`, async (t) => {
    const f = fixture(t);
    f.replies.policy = failure(code, status);
    await assert.rejects(presignUpload(f.storage, input));
  });
}

for (const grants of ["", grant + grant, grant.replace("FULL_CONTROL", "READ"), grant.replace("FULL_CONTROL", "WRITE"), grant.replaceAll("CanonicalUser", "Group"), grant.replaceAll("CanonicalUser", "AmazonCustomerByEmail"), grant.replace("</Grantee>", "<URI>https://example.test/group</URI></Grantee>"), grant.replace("</Grantee>", "<URI></URI></Grantee>"), grant.replace("</Grantee>", "<EmailAddress>user@example.test</EmailAddress></Grantee>"), grant.replace(/<Grantee.*<\/Grantee>/, "")]) {
  test(`MinIO rejects unexpected ACL ${grants}`, async (t) => {
    const f = fixture(t);
    f.replies.acl = ok(acl(grants));
    await assert.rejects(presignUpload(f.storage, input), /ACL must be private/);
  });
}

for (const provider of ["aws", "minio"]) {
  for (const status of ["", "Suspended"]) {
    test(`${provider} requires enabled versioning: ${status}`, async (t) => {
      const f = fixture(t, provider);
      f.replies.versioning = ok(versioning(status));
      await assert.rejects(presignUpload(f.storage, input), /versioning must be enabled/);
    });
  }
  for (const operation of provider === "aws" ? ["versioning", "publicAccessBlock"] : ["versioning", "acl", "policy"]) {
    for (const error of [failure("AccessDenied"), new Error("transport unavailable")]) {
      test(`${provider} fails closed when ${operation} fails: ${error instanceof Error ? "transport" : "access"}`, async (t) => {
        const f = fixture(t, provider);
        f.replies[operation] = error;
        await assert.rejects(presignUpload(f.storage, input));
      });
    }
  }
}

test("AWS uses only versioning and all four public access block flags", async (t) => {
  const f = fixture(t, "aws");
  await assertUploadBucket(f.storage);
  assert.deepEqual(f.requests.map((request) => Object.keys(request.query)[0]).sort(), ["publicAccessBlock", "versioning"]);
});

for (const flag of flags) {
  for (const value of ["false", ""]) {
    test(`AWS rejects ${flag}=${JSON.stringify(value)}`, async (t) => {
      const f = fixture(t, "aws");
      f.replies.publicAccessBlock = ok(block({ [flag]: value }));
      await assert.rejects(presignUpload(f.storage, input), /public access must be blocked/);
    });
  }
}

for (const code of ["NotImplemented", "NoSuchPublicAccessBlockConfiguration", "NoSuchBucketPolicy"]) {
  test(`default AWS never falls back on ${code}`, async (t) => {
    const f = fixture(t, "aws", { S3_PROVIDER: undefined });
    f.replies.publicAccessBlock = failure(code, code === "NotImplemented" ? 501 : 404);
    await assert.rejects(presignUpload(f.storage, input));
    assert.ok(f.requests.every((request) => !("acl" in request.query) && !("policy" in request.query)));
  });
}

for (const provider of ["aws", "minio"]) {
  for (const publicEndpoint of [undefined, "https://public.example.test:9443"]) {
    test(`${provider} signs the configured public host without using it for backend requests: ${publicEndpoint}`, async (t) => {
      const f = fixture(t, provider, { NODE_ENV: "production", S3_PUBLIC_ENDPOINT: publicEndpoint });
      const destroy = t.mock.method(S3Client.prototype, "destroy");
      const signed = await presignUpload(f.storage, input);
      const url = new URL(signed.url);
      assert.equal(url.host, publicEndpoint ? "public.example.test:9443" : "backend.example.test");
      assert.equal(url.pathname, "/test-bucket/uploads/test/file");
      assert.equal(url.searchParams.get("X-Amz-Expires"), "300");
      assert.equal(signed.expiresIn, 300);
      assert.deepEqual(signed.headers, {
        "content-type": input.mimeType,
        "content-length": String(input.size),
        "x-amz-checksum-sha256": input.checksum,
        "x-amz-server-side-encryption": "aws:kms",
        "x-amz-server-side-encryption-aws-kms-key-id": kmsKeyId,
        "if-none-match": "*",
      });
      assert.deepEqual(url.searchParams.get("X-Amz-SignedHeaders")!.split(";"), [...Object.keys(signed.headers), "host"].sort());
      for (const name of Object.keys(signed.headers)) assert.equal(url.searchParams.has(name), false);
      assert.equal(url.searchParams.get("X-Amz-Signature"), signature(url, signed.headers));
      const changed = new URL(url);
      changed.hostname = "different.example.test";
      assert.notEqual(url.searchParams.get("X-Amz-Signature"), signature(changed, signed.headers));
      assert.equal(destroy.mock.callCount(), 1);
      assert.notEqual(destroy.mock.calls[0].this, f.storage.client);
      const metadata = await headObject(f.storage, input.objectKey, "version-1");
      assert.equal(verifyObject(metadata, { size: BigInt(input.size), checksum: input.checksum, kmsKeyId, versionId: "version-1" }), "version-1");
      assert.throws(() => verifyObject(metadata, { size: BigInt(input.size), checksum: input.checksum, kmsKeyId: "clouddrive-dev" }));
      const head = f.requests.find((request) => request.method === "HEAD")!;
      assert.equal(head.query.versionId, "version-1");
      assert.equal(head.headers["x-amz-checksum-mode"], "ENABLED");
      assert.ok(f.requests.every((request) => request.hostname === "backend.example.test"));
      assert.ok(f.requests.every((request) => request.method !== "PUT"));
      f.storage.client.destroy();
      assert.equal(destroy.mock.callCount(), 2);
      assert.equal(destroy.mock.calls[1].this, f.storage.client);
    });
  }
}

test("signing failure destroys the transient signer but leaves backend ownership to the caller", async (t) => {
  const f = fixture(t);
  const destroy = t.mock.method(S3Client.prototype, "destroy");
  await assert.rejects(presignUpload(f.storage, { ...input, objectKey: "\ud800" }), URIError);
  assert.equal(destroy.mock.callCount(), 1);
  assert.notEqual(destroy.mock.calls[0].this, f.storage.client);
  await headObject(f.storage, input.objectKey);
});

test("bucket verification failure never creates a signer or destroys the backend", async (t) => {
  const f = fixture(t);
  f.replies.policy = failure("AccessDenied");
  const destroy = t.mock.method(S3Client.prototype, "destroy");
  await assert.rejects(presignUpload(f.storage, input));
  assert.equal(destroy.mock.callCount(), 0);
});
