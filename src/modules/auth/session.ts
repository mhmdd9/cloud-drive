import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { ApiError } from "@/lib/http";
import { SESSION_TTL, sessionKey, signSessionToken, verifySessionToken } from "./token";

export const SESSION_COOKIE = "clouddrive_session";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

export async function createSession(userId: string): Promise<void> {
  const key = sessionKey(process.env.SESSION_SECRET);
  const store = await cookies();
  const previous = store.get(SESSION_COOKIE)?.value;
  const oldSession = previous ? await verifySessionToken(previous, key) : null;
  if (oldSession) await getRedis().del(`session:${oldSession.jti}`);
  const { token, jti, expiresAt } = await signSessionToken(userId, key);
  const result = await getRedis().set(`session:${jti}`, userId, "EX", SESSION_TTL, "NX");
  if (result !== "OK") throw new Error("Unable to create session");
  store.set(SESSION_COOKIE, token, {
    ...cookieOptions(),
    maxAge: SESSION_TTL,
    expires: new Date(expiresAt * 1000),
  });
}

export async function deleteSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  try {
    if (token) {
      const session = await verifySessionToken(token, sessionKey(process.env.SESSION_SECRET));
      if (session) await getRedis().del(`session:${session.jti}`);
    }
  } finally {
    store.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0, expires: new Date(0) });
  }
}

export async function requireUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new ApiError(401, "Authentication required");
  const session = await verifySessionToken(token, sessionKey(process.env.SESSION_SECRET));
  if (!session || await getRedis().get(`session:${session.jti}`) !== session.userId) {
    throw new ApiError(401, "Authentication required");
  }
  const user = await getDb().user.findFirst({
    where: { id: session.userId, active: true },
    select: {
      id: true,
      email: true,
      name: true,
      active: true,
      roles: { include: { role: true } },
    },
  });
  if (!user) throw new ApiError(401, "Authentication required");
  return user;
}

export type AuthUser = Awaited<ReturnType<typeof requireUser>>;
