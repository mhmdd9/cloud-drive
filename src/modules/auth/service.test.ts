import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import Module, { createRequire } from "node:module";
import test, { type TestContext } from "node:test";

const load = createRequire(__filename);
const userId = "01995ba0-0000-7000-8000-000000000001";
const account = { id: userId, passwordHash: "stored-hash", active: true };
const keyFor = (value: string) => `auth:login:${createHash("sha256").update(value).digest("hex")}`;
const accountKey = `auth:login:account:${createHash("sha256").update(userId).digest("hex")}`;

function fixture(t: TestContext) {
  const events: string[] = [];
  const counts = new Map<string, number>();
  const evaluate = t.mock.fn(async (script: string, keys: number, key: string, member: string): Promise<number> => {
    events.push(key);
    assert.equal(keys, 1);
    assert.match(member, /^[a-f0-9]{32}$/);
    assert.match(script, /redis.call\('TIME'\)/);
    assert.match(script, /local window = 900000/);
    assert.match(script, /ZREMRANGEBYSCORE/);
    assert.match(script, /ZCARD', KEYS\[1\]\) >= 10/);
    assert.match(script, /ZADD', KEYS\[1\], now, ARGV\[1\]/);
    assert.match(script, /PEXPIRE', KEYS\[1\], window/);
    const count = counts.get(key) ?? 0;
    if (count >= 10) return 0;
    counts.set(key, count + 1);
    return 1;
  });
  const findUnique = t.mock.fn<(args: unknown) => Promise<typeof account | null>>(async () => {
    events.push("lookup");
    return account;
  });
  const verifyPassword = t.mock.fn(async (password: string, hash: string) => {
    events.push("verify");
    return password === " correct password " && hash === account.passwordHash;
  });
  const createSession = t.mock.fn(async (id: string) => { events.push(`session:${id}`); });
  const replacements: Array<[string, unknown]> = [
    ["server-only", {}],
    ["../../lib/db", { getDb: () => ({ user: { findUnique } }) }],
    ["../../lib/redis", { getRedis: () => ({ eval: evaluate }) }],
    ["./password", { verifyPassword }],
    ["./session", { createSession }],
  ];
  const saved = [...replacements.map(([path]) => path), "./service", "./throttle"].map((path) => {
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
  for (const path of ["./service", "./throttle"]) delete load.cache[load.resolve(path)];
  const { login } = load("./service") as typeof import("./service");
  const { throttleLogin, throttleLoginAccount } = load("./throttle") as typeof import("./throttle");
  return { login, throttleLogin, throttleLoginAccount, events, counts, evaluate, findUnique, verifyPassword, createSession };
}

for (const [field, value, where] of [
  ["identifier", " Admin ", { username: "admin" }],
  ["username", " Admin ", { username: "admin" }],
  ["identifier", " Admin@Example.TEST ", { email: "admin@example.test" }],
  ["email", " Admin@Example.TEST ", { email: "admin@example.test" }],
] as const) {
  test(`login accepts ${field} ${value.trim()} and preserves session identity`, async (t) => {
    const f = fixture(t);
    await f.login({ [field]: value, password: " correct password " });
    assert.deepEqual(f.findUnique.mock.calls[0].arguments, [{ where, select: { id: true, passwordHash: true, active: true } }]);
    assert.deepEqual(f.events, [keyFor(value.trim().toLowerCase()), "lookup", accountKey, "verify", `session:${userId}`]);
    assert.deepEqual(f.verifyPassword.mock.calls[0].arguments, [" correct password ", "stored-hash"]);
    assert.deepEqual(f.createSession.mock.calls[0].arguments, [userId]);
  });
}

for (const kind of ["unknown", "wrong", "inactive"] as const) {
  test(`${kind} account credentials return the same generic error without a session`, async (t) => {
    const f = fixture(t);
    f.findUnique.mock.mockImplementation(async () => kind === "unknown" ? null : { ...account, active: kind !== "inactive" });
    await assert.rejects(f.login({ identifier: "admin", password: kind === "wrong" ? "wrong" : " correct password " }), {
      status: 401, message: "Invalid credentials",
    });
    assert.equal(f.verifyPassword.mock.callCount(), 1);
    assert.equal(f.createSession.mock.callCount(), 0);
    const hash = f.verifyPassword.mock.calls[0].arguments[1];
    assert.equal(hash, kind === "unknown" ? `scrypt$${"0".repeat(32)}$${"0".repeat(128)}` : account.passwordHash);
    assert.equal(f.counts.get(accountKey), kind === "unknown" ? undefined : 1);
  });
}

test("ambiguous and invalid credentials fail before throttling or lookup", async (t) => {
  const f = fixture(t);
  for (const input of [
    { identifier: "admin", email: "admin@example.test", password: "p" },
    { identifier: "ab", password: "p" },
    { identifier: "admin", password: "ا".repeat(513) },
  ]) await assert.rejects(f.login(input), { status: 400, message: "Invalid credentials" });
  assert.equal(f.evaluate.mock.callCount(), 0);
  assert.equal(f.findUnique.mock.callCount(), 0);
  assert.equal(f.verifyPassword.mock.callCount(), 0);
});

test("normalized unknown identifiers are limited before lookup and dummy verification", async (t) => {
  const f = fixture(t);
  f.findUnique.mock.mockImplementation(async () => null);
  for (let i = 0; i < 10; i++) {
    await assert.rejects(f.login({ identifier: i % 2 ? " Missing " : "missing", password: "wrong" }), { status: 401 });
  }
  await assert.rejects(f.login({ identifier: "MISSING", password: "wrong" }), { status: 429 });
  assert.equal(f.findUnique.mock.callCount(), 10);
  assert.equal(f.verifyPassword.mock.callCount(), 10);
  assert.equal(f.counts.size, 1);
});

test("username and email aliases share ten account password attempts including concurrent calls", async (t) => {
  const f = fixture(t);
  const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => f.login({
    [i % 2 ? "email" : "identifier"]: i % 2 ? " Admin@Example.TEST " : " Admin ", password: "wrong",
  })));
  const statuses = attempts.map((result) => result.status === "rejected" ? result.reason.status : 200);
  assert.equal(statuses.filter((status) => status === 401).length, 10);
  assert.equal(statuses.filter((status) => status === 429).length, 2);
  assert.equal(f.verifyPassword.mock.callCount(), 10);
  assert.equal(f.counts.get(accountKey), 10);
  assert.equal(f.counts.get(keyFor("admin")), 6);
  assert.equal(f.counts.get(keyFor("admin@example.test")), 6);
  assert.equal(f.createSession.mock.callCount(), 0);
  assert.equal(new Set(f.evaluate.mock.calls.map((call) => call.arguments[3])).size, 24);
});

test("identifier and account namespaces cannot collide", async (t) => {
  const f = fixture(t);
  await f.throttleLogin(" Admin ");
  await f.throttleLoginAccount("admin");
  assert.equal(f.counts.size, 2);
  assert.equal(f.counts.get(keyFor("admin")), 1);
});

test("Redis errors and unexpected replies fail closed before password verification", async (t) => {
  const f = fixture(t);
  f.evaluate.mock.mockImplementation(async () => { throw new Error("Redis unavailable"); });
  await assert.rejects(f.login({ identifier: "admin", password: "p" }), /Redis unavailable/);
  assert.equal(f.findUnique.mock.callCount(), 0);
  f.evaluate.mock.mockImplementation(async () => 2);
  await assert.rejects(f.login({ identifier: "admin", password: "p" }), { status: 429 });
  f.evaluate.mock.mockImplementation(async (_script, _keys, key) => {
    if (key === accountKey) throw new Error("Redis unavailable");
    return 1;
  });
  await assert.rejects(f.login({ identifier: "admin", password: "p" }), /Redis unavailable/);
  assert.equal(f.verifyPassword.mock.callCount(), 0);
  assert.equal(f.createSession.mock.callCount(), 0);
});
