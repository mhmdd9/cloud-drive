import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getRedis } from "@/lib/redis";
import { ApiError } from "@/lib/http";

const throttleScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window = 900000
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= 10 then
  return 0
end
redis.call('ZADD', KEYS[1], now, ARGV[1])
redis.call('PEXPIRE', KEYS[1], window)
return 1
`;

export async function throttleLogin(email: string): Promise<void> {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  const allowed = await getRedis().eval(throttleScript, 1, `auth:login:${hash}`, randomBytes(16).toString("hex"));
  if (allowed !== 1) throw new ApiError(429, "Too many login attempts. Try again later.");
}
