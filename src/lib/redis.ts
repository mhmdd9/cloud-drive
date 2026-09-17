import Redis, { type RedisOptions } from "ioredis";

const globalForRedis = globalThis as typeof globalThis & {
  clouddriveRedis?: Redis;
};

export function redisConnectionOptions(): RedisOptions {
  try {
    const value = process.env.REDIS_URL;
    if (!value || value !== value.trim()) {
      throw new Error();
    }

    const url = new URL(value);
    const database = url.pathname.replace(/^\//, "");
    const port = url.port ? Number(url.port) : 6379;
    const db = database ? Number(database) : 0;

    if (
      !["redis:", "rediss:"].includes(url.protocol) ||
      !url.hostname ||
      url.search ||
      url.hash ||
      (database !== "" && !/^\d+$/.test(database)) ||
      !Number.isSafeInteger(db) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new Error();
    }

    const host = url.hostname.replace(/^\[|\]$/g, "");

    return {
      host,
      port,
      db,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
      lazyConnect: true,
      maxRetriesPerRequest: null,
      connectTimeout: 5000,
    };
  } catch {
    throw new Error("REDIS_URL must be a valid redis:// or rediss:// URL with an optional numeric database and no query or fragment.");
  }
}

export function getRedis(): Redis {
  if (!globalForRedis.clouddriveRedis) {
    const redis = new Redis({
      ...redisConnectionOptions(),
      maxRetriesPerRequest: 1,
    });
    redis.on("error", () => {});
    globalForRedis.clouddriveRedis = redis;
  }

  return globalForRedis.clouddriveRedis;
}
