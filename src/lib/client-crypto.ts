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

async function generateIdentity(): Promise<{ keyPair: CryptoKeyPair; publicKey: JsonWebKey }> {
  const keyPair = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  return { keyPair, publicKey: await crypto.subtle.exportKey("jwk", keyPair.publicKey) };
}

export type IdentityStatus = "ready" | "created" | "needs-recovery";

let identityInitialization: Promise<IdentityStatus> | null = null;

async function initializeEncryptionIdentity(): Promise<IdentityStatus> {
  const response = await fetch("/api/security/identity-key", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load encryption identity");
  const serverIdentity = await response.json() as { publicKey: JsonWebKey | null };
  const localIdentity = await readIdentity();
  if (localIdentity && serverIdentity.publicKey) return "ready";
  if (serverIdentity.publicKey && !localIdentity) return "needs-recovery";
  const identity = await generateIdentity();
  const saveResponse = await fetch("/api/security/identity-key", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: identity.publicKey }) });
  if (!saveResponse.ok) throw new Error("Unable to register encryption identity");
  await saveIdentity(identity.keyPair);
  return "created";
}

export function ensureEncryptionIdentity(): Promise<IdentityStatus> {
  identityInitialization ??= initializeEncryptionIdentity();
  return identityInitialization;
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
