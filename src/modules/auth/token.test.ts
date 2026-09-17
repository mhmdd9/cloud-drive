import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeJwt, SignJWT } from "jose";
import { SESSION_TTL, sessionKey, signSessionToken, verifySessionToken } from "./token";

const key = sessionKey("test-secret-with-at-least-32-bytes");
const userId = "01956800-1234-7000-8000-000000000001";

test("sessions have eight-hour minimal claims and unique opaque IDs", async () => {
  const first = await signSessionToken(userId, key);
  const second = await signSessionToken(userId, key);
  const claims = decodeJwt(first.token);
  assert.notEqual(first.jti, second.jti);
  assert.match(first.jti, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(claims.iss, "clouddrive");
  assert.equal(claims.aud, "web");
  assert.equal(claims.exp! - claims.iat!, SESSION_TTL);
  assert.deepEqual(Object.keys(claims).sort(), ["aud", "exp", "iat", "iss", "jti", "sub"]);
  assert.deepEqual(await verifySessionToken(first.token, key), { userId, jti: first.jti });
});

test("tampered, malformed, and incorrectly signed tokens are rejected", async () => {
  const { token } = await signSessionToken(userId, key);
  const [header, body, signature] = token.split(".");
  const changed = Buffer.from(JSON.stringify({ ...decodeJwt(token), sub: "01956800-1234-7000-8000-000000000002" })).toString("base64url");
  assert.equal(await verifySessionToken(`${header}.${changed}.${signature}`, key), null);
  assert.equal(await verifySessionToken(`${header}.${body}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`, key), null);
  assert.equal(await verifySessionToken(token, sessionKey("another-secret-with-at-least-32-bytes")), null);
  assert.equal(await verifySessionToken("invalid", key), null);
  assert.equal(await verifySessionToken("x".repeat(2049), key), null);
});

test("signed tokens require correct issuer, audience, subject, ID, algorithm, and lifetime", async () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "clouddrive", aud: "web", sub: userId, jti: "a".repeat(43), iat: now, exp: now + SESSION_TTL };
  for (const changed of [
    { iss: "other" }, { aud: "other" }, { sub: "" }, { sub: "invalid-id" }, { jti: "" },
    { iat: undefined }, { exp: undefined }, { exp: now + SESSION_TTL + 1 },
    { iat: now - SESSION_TTL - 1, exp: now - 1 },
    { iat: now + 60, exp: now + SESSION_TTL + 60 },
  ]) {
    const token = await new SignJWT({ ...claims, ...changed }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).sign(key);
    assert.equal(await verifySessionToken(token, key), null);
  }
  const token = await new SignJWT(claims).setProtectedHeader({ alg: "HS384", typ: "JWT" }).sign(key);
  assert.equal(await verifySessionToken(token, key), null);
});

test("session keys fail closed without at least 32 UTF-8 bytes", () => {
  assert.throws(() => sessionKey(undefined));
  assert.throws(() => sessionKey(""));
  assert.throws(() => sessionKey("a".repeat(31)));
  assert.equal(sessionKey("ا".repeat(16)).byteLength, 32);
});
