import assert from "node:assert/strict";
import test from "node:test";
import { checksumFromObjectKey, checksumSchema, createObjectKey, fileIdSchema, maxUploadBytes, ObjectVerificationError, uploadSchema, validVersionId, verifyObject } from "./validation";

const checksum = Buffer.alloc(32, 1).toString("base64");
const input = { name: "report.pdf", mimeType: "application/pdf", size: 100, checksum };
const id = "01995ba0-0000-7000-8000-000000000001";

test("upload accepts bounded metadata and strips filename path and control characters", () => {
  const result = uploadSchema(100).parse({ ...input, name: " ../a\\b\u0000\u202e：x " });
  assert.equal(result.name, ".._a_b___x");
  assert.equal(uploadSchema(100).parse(input).size, 100);
});

test("upload rejects invalid sizes, MIME, names, extra properties and checksums", () => {
  for (const size of [0, -1, 101, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "100"]) {
    assert.equal(uploadSchema(100).safeParse({ ...input, size }).success, false);
  }
  for (const name of ["", " ", "..", "x".repeat(256)]) {
    assert.equal(uploadSchema(100).safeParse({ ...input, name }).success, false);
  }
  for (const mimeType of ["text", "text/plain; charset=utf-8", "text/plain\r\n", `text/${"x".repeat(128)}`]) {
    assert.equal(uploadSchema(100).safeParse({ ...input, mimeType }).success, false);
  }
  assert.equal(uploadSchema(100).safeParse({ ...input, ownerId: id }).success, false);
  for (const value of ["", Buffer.alloc(31).toString("base64"), Buffer.alloc(33).toString("base64"), checksum.slice(0, -1), `${checksum}\n`, `${checksum.slice(0, 42)}F=`]) {
    assert.equal(checksumSchema.safeParse(value).success, false);
  }
});

test("upload size configuration fails closed", () => {
  assert.equal(maxUploadBytes("104857600"), 104857600);
  for (const value of ["", "0", "-1", "1.5", " 100", "1e3", "9007199254740992"]) {
    assert.throws(() => maxUploadBytes(value));
  }
  assert.throws(() => uploadSchema(Infinity));
});

test("object key binds expected checksum to a UUID without trusting object metadata", () => {
  assert.equal(checksumFromObjectKey(createObjectKey(id, checksum)), checksum);
  assert.throws(() => checksumFromObjectKey(`uploads/invalid/${"a".repeat(64)}`));
  assert.throws(() => checksumFromObjectKey(`${createObjectKey(id, checksum)}/extra`));
  assert.equal(fileIdSchema.safeParse("not-a-uuid").success, false);
});

test("version ids must identify an immutable version", () => {
  assert.equal(validVersionId("v1+/="), true);
  for (const value of [undefined, null, "", "null", " v1", "v1\n", "x".repeat(1025)]) {
    assert.equal(validVersionId(value), false);
  }
});

test("verification requires exact size, checksum, encryption, key and version", () => {
  const metadata = { ContentLength: 100, ChecksumSHA256: checksum, ServerSideEncryption: "aws:kms", SSEKMSKeyId: "key-arn", VersionId: "version-1" };
  const expected = { size: BigInt(100), checksum, kmsKeyId: "key-arn", versionId: "version-1" };
  assert.equal(verifyObject(metadata, expected), "version-1");
  for (const changed of [
    { ContentLength: undefined }, { ContentLength: 99 }, { ContentLength: 1.5 },
    { ChecksumSHA256: undefined }, { ChecksumSHA256: Buffer.alloc(32).toString("base64") },
    { ServerSideEncryption: "AES256" }, { SSEKMSKeyId: "alias/key" },
    { VersionId: "null" }, { VersionId: "version-2" },
  ]) assert.throws(() => verifyObject({ ...metadata, ...changed }, expected), ObjectVerificationError);
  assert.throws(() => verifyObject(metadata, { ...expected, kmsKeyId: "" }), ObjectVerificationError);
});
