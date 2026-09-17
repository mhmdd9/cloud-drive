import { getRedis } from "@/lib/redis";
import { ApiError } from "@/lib/http";

const limitScript = `
local count = redis.call('INCR', KEYS[1])
if count == 1 or redis.call('PTTL', KEYS[1]) < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
return count
`;

export async function limitUploadRequests(userId: string): Promise<void> {
  const count = await getRedis().eval(limitScript, 1, `files:uploads:${userId}`, 60000);
  if (typeof count !== "number") throw new Error("Upload rate limiter unavailable");
  if (count > 20) throw new ApiError(429, "Upload request limit exceeded");
}
