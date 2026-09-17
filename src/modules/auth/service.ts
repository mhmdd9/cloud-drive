import "server-only";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/http";
import { credentialsSchema } from "./identifier";
import { verifyPassword } from "./password";
import { createSession } from "./session";
import { throttleLogin, throttleLoginAccount } from "./throttle";

const dummyHash = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export async function login(input: unknown): Promise<void> {
  const result = credentialsSchema.safeParse(input);
  if (!result.success) throw new ApiError(400, "Invalid credentials");
  const { identifier, password } = result.data;
  await throttleLogin(identifier);
  const user = await getDb().user.findUnique({
    where: identifier.includes("@") ? { email: identifier } : { username: identifier },
    select: { id: true, passwordHash: true, active: true },
  });
  if (user) await throttleLoginAccount(user.id);
  const valid = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !valid || !user.active) throw new ApiError(401, "Invalid credentials");
  await createSession(user.id);
}
