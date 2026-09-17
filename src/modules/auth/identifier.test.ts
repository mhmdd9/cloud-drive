import assert from "node:assert/strict";
import { test } from "node:test";
import { credentialsSchema, emailSchema, usernameSchema } from "./identifier";

test("identifiers normalize case and surrounding whitespace", () => {
  assert.equal(usernameSchema.parse(" Admin.Name_1- "), "admin.name_1-");
  assert.equal(emailSchema.parse(" Admin@Example.TEST "), "admin@example.test");
  for (const key of ["identifier", "email", "username"]) {
    const value = key === "email" ? " Admin@Example.TEST " : " Admin ";
    assert.deepEqual(credentialsSchema.parse({ [key]: value, password: " Pässword " }), {
      identifier: key === "email" ? "admin@example.test" : "admin",
      password: " Pässword ",
    });
  }
});

test("usernames require 3-32 ASCII characters and an alphanumeric start", () => {
  for (const value of ["abc", "1._-", "a".repeat(32)]) assert.equal(usernameSchema.safeParse(value).success, true);
  for (const value of ["", "ab", "a".repeat(33), "_abc", ".abc", "-abc", "a b", "a/b", "a@b", "مدیر", "Kelvin", "ａｂｃ", "ab\nc"]) {
    assert.equal(usernameSchema.safeParse(value).success, false, value);
  }
});

test("credentials accept normalized email identifiers and reject ambiguous or extra fields", () => {
  assert.deepEqual(credentialsSchema.parse({ identifier: " Admin@Example.TEST ", password: "p" }), {
    identifier: "admin@example.test", password: "p",
  });
  for (const input of [
    null, {}, { password: "p" }, { identifier: "admin" },
    { identifier: "a@", password: "p" }, { email: "admin", password: "p" },
    { username: "admin@example.test", password: "p" },
    { identifier: "admin", email: "admin@example.test", password: "p" },
    { identifier: "admin", username: "admin", password: "p" },
    { email: "admin@example.test", username: "admin", password: "p" },
    { identifier: "admin", password: "p", extra: true },
    { identifier: 123, password: "p" }, { identifier: "admin", password: 123 },
  ]) assert.equal(credentialsSchema.safeParse(input).success, false);
});

test("passwords remain unchanged and are bounded by UTF-8 bytes", () => {
  for (const password of [" ", " x ", "a".repeat(1024), "ا".repeat(512), "😀".repeat(256)]) {
    assert.equal(credentialsSchema.parse({ identifier: "admin", password }).password, password);
  }
  for (const password of ["", "a".repeat(1025), "ا".repeat(513), "😀".repeat(257)]) {
    assert.equal(credentialsSchema.safeParse({ identifier: "admin", password }).success, false);
  }
});
