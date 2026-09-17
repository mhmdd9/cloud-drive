import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { verifyPassword } from "./password";
import { createSession } from "./session";
import { throttleLogin } from "./throttle";

const credentialsSchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(1024).refine((value) => Buffer.byteLength(value, "utf8") <= 1024),
});
const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function login(input: unknown): Promise<void> {
  const result = credentialsSchema.safeParse(input);
  if (!result.success) throw new ApiError(400, "Invalid credentials");
  const { email, password } = result.data;
  await throttleLogin(email);
  const user = await getDb().user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, active: true },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !valid || !user.active) throw new ApiError(401, "Invalid credentials");
  await createSession(user.id);
}
