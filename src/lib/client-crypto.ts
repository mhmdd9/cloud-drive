const DB_NAME = "clouddrive-security";
const STORE_NAME = "identity";
const KEY_NAME = "rsa-oaep-identity";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open secure key storage"));
  });
}

async function readIdentity(): Promise<CryptoKeyPair | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(KEY_NAME);
    request.onsuccess = () => resolve((request.result as { keyPair: CryptoKeyPair } | undefined)?.keyPair ?? null);
    request.onerror = () => reject(request.error ?? new Error("Unable to read secure identity"));
  });
}

async function saveIdentity(keyPair: CryptoKeyPair): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ keyPair }, KEY_NAME);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save secure identity"));
  });
}

async function deleteIdentity(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(KEY_NAME);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear secure identity"));
  });
}

async function generateIdentity(): Promise<{ keyPair: CryptoKeyPair; publicKey: JsonWebKey }> {
  const keyPair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  return { keyPair, publicKey: await crypto.subtle.exportKey("jwk", keyPair.publicKey) };
}

export type IdentityStatus = "ready" | "created" | "needs-recovery";
export type RecoveryStatus = { configured: boolean; createdAt: string | null };

let identityInitialization: Promise<IdentityStatus> | null = null;

async function initializeEncryptionIdentity(): Promise<IdentityStatus> {
  const response = await fetch("/api/security/identity-key", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load encryption identity");
  const serverIdentity = await response.json() as { publicKey: JsonWebKey | null };
  const localIdentity = await readIdentity();
  if (localIdentity && serverIdentity.publicKey) return "ready";
  if (serverIdentity.publicKey && !localIdentity) return "needs-recovery";
  const identity = await generateIdentity();
  await saveIdentity(identity.keyPair);
  const saveResponse = await fetch("/api/security/identity-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: identity.publicKey }) });
  if (!saveResponse.ok) {
    await deleteIdentity();
    throw new Error("Unable to register encryption identity");
  }
  return "created";
}

export function ensureEncryptionIdentity(): Promise<IdentityStatus> {
  identityInitialization ??= initializeEncryptionIdentity();
  return identityInitialization;
}

export async function resetEncryptionIdentity(): Promise<void> {
  const response = await fetch("/api/security/identity-key", { method: "DELETE", headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new Error((await response.json().catch(() => null) as { error?: string } | null)?.error || "بازنشانی هویت امنیتی انجام نشد.");
  await deleteIdentity();
  identityInitialization = null;
}

async function deriveRecoveryKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(code.trim()), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: 250000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

function formatRecoveryCode(value: string): string {
  return value.match(/.{1,8}/g)?.join("-") ?? value;
}

function normalizeRecoveryCode(value: string): string {
  return value.replace(/-/g, "").replace(/\s/g, "");
}

export async function getRecoveryStatus(): Promise<RecoveryStatus> {
  const response = await fetch("/api/security/recovery-key", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load recovery key status");
  const data = await response.json() as { configured: boolean; createdAt: string | null };
  return data;
}

export async function createRecoveryKey(): Promise<string> {
  const identity = await readIdentity();
  if (!identity) throw new Error("Private encryption identity is unavailable");
  const privateJwk = await crypto.subtle.exportKey("jwk", identity.privateKey);
  const code = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const recoveryKey = await deriveRecoveryKey(code, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, recoveryKey, new TextEncoder().encode(JSON.stringify(privateJwk)));
  const response = await fetch("/api/security/recovery-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ encryptedPrivateKey: bytesToBase64Url(new Uint8Array(encrypted)), salt: bytesToBase64Url(salt), iv: bytesToBase64Url(iv) }) });
  if (!response.ok) throw new Error("Unable to save recovery key");
  return formatRecoveryCode(code);
}

export async function recoverEncryptionIdentity(inputCode: string): Promise<void> {
  const code = normalizeRecoveryCode(inputCode);
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error("کد بازیابی معتبر نیست.");
  const response = await fetch("/api/security/recovery-key", { cache: "no-store" });
  if (!response.ok) throw new Error("دریافت اطلاعات بازیابی انجام نشد.");
  const data = await response.json() as { encryptedPrivateKey: string | null; salt: string | null; iv: string | null };
  if (!data.encryptedPrivateKey || !data.salt || !data.iv) throw new Error("برای این حساب کد بازیابی تنظیم نشده است.");
  try {
    const salt = base64UrlToBytes(data.salt);
    const iv = base64UrlToBytes(data.iv);
    const key = await deriveRecoveryKey(code, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, base64UrlToBytes(data.encryptedPrivateKey) as BufferSource);
    const privateJwk = JSON.parse(new TextDecoder().decode(decrypted)) as JsonWebKey;
    const publicResponse = await fetch("/api/security/identity-key", { cache: "no-store" });
    const publicData = await publicResponse.json() as { publicKey: JsonWebKey | null };
    if (!publicData.publicKey) throw new Error("کلید عمومی حساب پیدا نشد.");
    const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["decrypt"]);
    const publicKey = await crypto.subtle.importKey("jwk", publicData.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]);
    await saveIdentity({ privateKey, publicKey });
  } catch { throw new Error("کد بازیابی نادرست است یا اطلاعات بازیابی آسیب دیده است."); }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function encryptFileForOwner(file: File): Promise<{ encrypted: Blob; iv: string; ownerEncryptedFileKey: string; originalSize: number }> {
  const response = await fetch("/api/security/identity-key", { cache: "no-store" });
  if (!response.ok) throw new Error("Encryption identity is unavailable");
  const { publicKey } = await response.json() as { publicKey: JsonWebKey | null };
  if (!publicKey) throw new Error("Encryption identity is unavailable");
  const ownerKey = await crypto.subtle.importKey("jwk", publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const fileKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, fileKey, await file.arrayBuffer());
  const rawFileKey = await crypto.subtle.exportKey("raw", fileKey);
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, ownerKey, rawFileKey);
  return { encrypted: new Blob([encrypted], { type: "application/octet-stream" }), iv: bytesToBase64Url(iv), ownerEncryptedFileKey: bytesToBase64Url(new Uint8Array(wrappedKey)), originalSize: file.size };
}

export async function wrapOwnerFileKeyForRecipient(ownerEncryptedFileKey: string, recipientPublicKey: JsonWebKey): Promise<string> {
  const identity = await readIdentity();
  if (!identity) throw new Error("Private encryption identity is unavailable");
  const ownerRawKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, identity.privateKey, base64UrlToBytes(ownerEncryptedFileKey) as BufferSource);
  const recipientKey = await crypto.subtle.importKey("jwk", recipientPublicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, recipientKey, ownerRawKey);
  return bytesToBase64Url(new Uint8Array(wrappedKey));
}

export async function decryptConfidentialFile(encrypted: ArrayBuffer, wrappedFileKey: string, iv: string): Promise<ArrayBuffer> {
  const identity = await readIdentity();
  if (!identity) throw new Error("Private encryption identity is unavailable");
  const rawFileKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, identity.privateKey, base64UrlToBytes(wrappedFileKey) as BufferSource);
  const fileKey = await crypto.subtle.importKey("raw", rawFileKey, { name: "AES-GCM" }, false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: base64UrlToBytes(iv) as BufferSource }, fileKey, encrypted);
}
