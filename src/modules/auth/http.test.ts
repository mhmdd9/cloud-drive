import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, apiError, assertSameOrigin, readJson } from "../../lib/http";

function jsonRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

test("JSON parsing enforces content type, valid JSON, and byte bounds", async () => {
  assert.deepEqual(await readJson(jsonRequest('{"ok":true}')), { ok: true });
  await assert.rejects(readJson(jsonRequest("{}", { "Content-Type": "text/plain" })), { status: 415 });
  await assert.rejects(readJson(jsonRequest("{")), { status: 400 });
  await assert.rejects(readJson(jsonRequest("{}", { "Content-Length": "16385" })), { status: 413 });
  assert.equal(await readJson(jsonRequest(JSON.stringify("a".repeat(16382)))), "a".repeat(16382));
  await assert.rejects(readJson(jsonRequest(JSON.stringify("ا".repeat(8192)), { "Content-Length": "2" })), { status: 413 });
});

test("chunked JSON parsing stops and cancels at the byte limit", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(4096)); },
    cancel() { cancelled = true; },
  });
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(readJson(request), { status: 413 });
  assert.equal(cancelled, true);
});

test("origin requires exact configured origin and never trusts forwarding headers", () => {
  const previous = process.env.APP_ORIGIN;
  try {
    process.env.APP_ORIGIN = "https://example.test";
    assert.doesNotThrow(() => assertSameOrigin(jsonRequest("{}", { Origin: "https://example.test" })));
    for (const origin of ["null", "https://other.test", "https://example.test/", "https://example.test:443"]) {
      assert.throws(() => assertSameOrigin(jsonRequest("{}", { Origin: origin })), { status: 403 });
    }
    assert.throws(() => assertSameOrigin(jsonRequest("{}", { "X-Forwarded-Host": "example.test" })), { status: 403 });
    delete process.env.APP_ORIGIN;
    assert.throws(() => assertSameOrigin(jsonRequest("{}")));
    process.env.APP_ORIGIN = "https://example.test/";
    assert.throws(() => assertSameOrigin(jsonRequest("{}")));
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = previous;
  }
});

test("API errors are no-store and unexpected errors never expose their messages", async () => {
  for (const error of [new Error("secret connection string"), new ApiError(500, "secret"), "secret"]) {
    const response = apiError(error);
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.deepEqual(await response.json(), { error: "Internal server error" });
  }
  const response = apiError(new ApiError(401, "Authentication required"));
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Authentication required" });
});
