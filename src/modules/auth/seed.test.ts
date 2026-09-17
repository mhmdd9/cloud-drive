import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import test, { type TestContext } from "node:test";

const load = createRequire(__filename);
type Existing = { id: string; username: string | null; roles: Array<{ role: { name: string } }> };
const admin: Existing = { id: "admin-id", username: null, roles: [{ role: { name: "admin" } }] };

function fixture(t: TestContext, existing: Existing | null = null) {
  const keys = ["ADMIN_EMAIL", "ADMIN_USERNAME", "ADMIN_PASSWORD", "ADMIN_NAME"];
  const previous = keys.map((key) => [key, process.env[key]] as const);
  const exitCode = process.exitCode;
  Object.assign(process.env, { ADMIN_EMAIL: " Admin@Example.TEST ", ADMIN_USERNAME: " Admin ", ADMIN_PASSWORD: " password unchanged ", ADMIN_NAME: " Admin " });
  process.exitCode = 0;
  const errors = t.mock.method(console, "error", () => {});
  const findUnique = t.mock.fn<(args: unknown) => Promise<Existing | null>>(async () => existing);
  const updateMany = t.mock.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 1 }));
  const create = t.mock.fn<(args: unknown) => Promise<object>>(async () => ({}));
  const upsert = t.mock.fn<(args: unknown) => Promise<{ id: string }>>(async () => ({ id: "admin-role-id" }));
  const hashPassword = t.mock.fn<(password: string) => Promise<string>>(async () => "new-hash");
  const tx = { user: { findUnique, updateMany, create }, role: { upsert } };
  const transaction = t.mock.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx));
  let finish: () => void = () => {};
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const db = { $transaction: transaction, $disconnect: async () => { finish(); } };
  const replacements: Array<[string, unknown]> = [
    ["dotenv/config", {}],
    ["../../lib/db", { getDb: () => db }],
    ["./password", { hashPassword }],
  ];
  const seedPath = "../../../prisma/seed";
  const saved = [...replacements.map(([path]) => path), seedPath].map((path) => {
    const resolved = load.resolve(path);
    return { resolved, cached: load.cache[resolved] };
  });
  t.after(() => {
    process.exitCode = exitCode;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
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
  return {
    findUnique, updateMany, create, upsert, hashPassword, transaction, errors,
    async run() {
      delete load.cache[load.resolve(seedPath)];
      load(seedPath);
      await finished;
    },
  };
}

test("seed creates a normalized administrator and preserves password bytes", async (t) => {
  const f = fixture(t);
  await f.run();
  assert.equal(process.exitCode, 0);
  assert.deepEqual(f.findUnique.mock.calls[0].arguments, [{
    where: { email: "admin@example.test" }, include: { roles: { include: { role: true } } },
  }]);
  assert.deepEqual(f.create.mock.calls[0].arguments, [{ data: {
    email: "admin@example.test", username: "admin", name: "Admin", passwordHash: "new-hash",
    roles: { create: { roleId: "admin-role-id" } },
  } }]);
  assert.deepEqual(f.hashPassword.mock.calls[0].arguments, [" password unchanged "]);
});

for (const username of [undefined, "", "   "]) {
  test(`seed allows optional username ${JSON.stringify(username)}`, async (t) => {
    const f = fixture(t);
    if (username === undefined) delete process.env.ADMIN_USERNAME;
    else process.env.ADMIN_USERNAME = username;
    await f.run();
    assert.equal(process.exitCode, 0);
    const args = f.create.mock.calls[0].arguments[0] as { data: { username?: string } };
    assert.equal(args.data.username, undefined);
  });
}

test("seed assigns a null username only to a confirmed administrator without changing password or roles", async (t) => {
  const f = fixture(t, admin);
  await f.run();
  assert.equal(process.exitCode, 0);
  assert.deepEqual(f.updateMany.mock.calls[0].arguments, [{
    where: { id: "admin-id", username: null, roles: { some: { role: { name: "admin" } } } },
    data: { username: "admin" },
  }]);
  assert.equal(f.hashPassword.mock.callCount(), 0);
  assert.equal(f.create.mock.callCount(), 0);
});

test("seed is idempotent for an administrator with the requested username", async (t) => {
  const f = fixture(t, { ...admin, username: "admin" });
  await f.run();
  assert.equal(process.exitCode, 0);
  assert.equal(f.updateMany.mock.callCount(), 0);
  assert.equal(f.hashPassword.mock.callCount(), 0);
  assert.equal(f.create.mock.callCount(), 0);
});

for (const existing of [{ ...admin, roles: [] }, { ...admin, username: "different" }]) {
  test(`seed rejects unsafe existing account ${JSON.stringify(existing)}`, async (t) => {
    const f = fixture(t, existing);
    await f.run();
    assert.equal(process.exitCode, 1);
    assert.equal(f.updateMany.mock.callCount(), 0);
    assert.equal(f.create.mock.callCount(), 0);
    assert.equal(f.hashPassword.mock.callCount(), 0);
    assert.equal(f.upsert.mock.callCount(), 0);
  });
}

test("seed without username leaves an unrelated email account unchanged", async (t) => {
  const f = fixture(t, { ...admin, roles: [] });
  delete process.env.ADMIN_USERNAME;
  await f.run();
  assert.equal(process.exitCode, 0);
  assert.equal(f.updateMany.mock.callCount(), 0);
  assert.equal(f.create.mock.callCount(), 0);
  assert.equal(f.hashPassword.mock.callCount(), 0);
});

for (const existing of [null, admin]) {
  test(`seed propagates username collisions for ${existing ? "existing" : "new"} administrators without fallback`, async (t) => {
    const f = fixture(t, existing);
    const collision = async () => { throw new Error("Unique constraint failed: private details"); };
    f.create.mock.mockImplementation(collision);
    f.updateMany.mock.mockImplementation(collision);
    await f.run();
    assert.equal(process.exitCode, 1);
    assert.equal(f.create.mock.callCount() + f.updateMany.mock.callCount(), 1);
    assert.deepEqual(f.errors.mock.calls[0].arguments, ["Seed failed. Check administrator settings and database availability."]);
  });
}

test("seed fails if administrator role or null username changed during assignment", async (t) => {
  const f = fixture(t, admin);
  f.updateMany.mock.mockImplementation(async () => ({ count: 0 }));
  await f.run();
  assert.equal(process.exitCode, 1);
  assert.equal(f.create.mock.callCount(), 0);
});

for (const settings of [{ ADMIN_USERNAME: "bad username" }, { ADMIN_PASSWORD: "ا".repeat(513) }]) {
  test(`seed rejects invalid ${Object.keys(settings)[0]} before database access`, async (t) => {
    const f = fixture(t);
    Object.assign(process.env, settings);
    await f.run();
    assert.equal(process.exitCode, 1);
    assert.equal(f.transaction.mock.callCount(), 0);
  });
}
