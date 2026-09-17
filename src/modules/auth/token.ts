import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_TTL = 8 * 60 * 60;
const issuer = "clouddrive";
const audience = "web";
const subjectPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const jtiPattern = /^[A-Za-z0-9_-]{43}$/;

export function sessionKey(secret: string | undefined): Uint8Array {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 bytes");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string, key: Uint8Array) {
  if (key.byteLength < 32 || !subjectPattern.test(userId)) throw new Error("Invalid session configuration");
  const jti = randomBytes(32).toString("base64url");
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(userId)
    .setJti(jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(key);
  return { token, jti, expiresAt };
}

export async function verifySessionToken(token: string, key: Uint8Array) {
  if (key.byteLength < 32) throw new Error("Invalid session configuration");
  if (token.length > 2048) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      issuer,
      audience,
      typ: "JWT",
      requiredClaims: ["sub", "jti", "iat", "exp"],
      maxTokenAge: SESSION_TTL,
    });
    if (
      typeof payload.sub !== "string" || !subjectPattern.test(payload.sub) ||
      typeof payload.jti !== "string" || !jtiPattern.test(payload.jti) ||
      typeof payload.iat !== "number" || !Number.isInteger(payload.iat) ||
      typeof payload.exp !== "number" || !Number.isInteger(payload.exp) ||
      payload.exp - payload.iat !== SESSION_TTL ||
      payload.iat > Math.floor(Date.now() / 1000)
    ) return null;
    return { userId: payload.sub, jti: payload.jti };
  } catch {
    return null;
  }
}
