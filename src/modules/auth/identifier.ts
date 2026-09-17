import { z } from "zod";

export const usernameSchema = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/).toLowerCase();
export const emailSchema = z.string().trim().max(254).toLowerCase().pipe(z.email());
export const identifierSchema = z.union([usernameSchema, emailSchema]);
export const passwordSchema = z.string().min(1).max(1024).refine((value) => Buffer.byteLength(value, "utf8") <= 1024);

export const credentialsSchema = z.union([
  z.strictObject({ identifier: identifierSchema, password: passwordSchema }),
  z.strictObject({ email: emailSchema, password: passwordSchema }).transform(({ email, password }) => ({ identifier: email, password })),
  z.strictObject({ username: usernameSchema, password: passwordSchema }).transform(({ username, password }) => ({ identifier: username, password })),
]);
