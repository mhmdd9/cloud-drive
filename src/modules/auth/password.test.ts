import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "./password";

test("password hashes use independent salts and verify correct and wrong passwords", async () => {
  const password = "a-long-test-password";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first.split("$")[1], second.split("$")[1]);
  assert.match(first, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword(password, second), true);
  assert.equal(await verifyPassword("wrong-password", first), false);
});

test("malformed password hashes and oversized passwords are rejected", async () => {
  const valid = await hashPassword("a-long-test-password");
  for (const encoded of ["", "scrypt", "scrypt$salt$key", valid + "$extra", valid.replace("scrypt", "other"), valid.replace(/.$/, "g")]) {
    assert.equal(await verifyPassword("a-long-test-password", encoded), false);
  }
  assert.equal(await verifyPassword("ا".repeat(513), valid), false);
  await assert.rejects(hashPassword("short"));
  await assert.rejects(hashPassword("ا".repeat(513)));
});
