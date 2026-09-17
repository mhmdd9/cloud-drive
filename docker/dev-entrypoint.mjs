import { spawn } from "node:child_process";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

try {
  const user = encodeURIComponent(required("POSTGRES_USER"));
  const password = encodeURIComponent(required("POSTGRES_PASSWORD"));
  const database = encodeURIComponent(required("POSTGRES_DB"));
  const env = {
    ...process.env,
    DATABASE_URL: `postgresql://${user}:${password}@postgres:5432/${database}`,
  };
  if (process.env.REDIS_PASSWORD) {
    env.REDIS_URL = `redis://:${encodeURIComponent(process.env.REDIS_PASSWORD)}@redis:6379`;
  }
  delete env.POSTGRES_PASSWORD;
  delete env.REDIS_PASSWORD;
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new Error("Missing process command");
  const child = spawn(command, args, { env, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", () => {
    process.stderr.write("Development process failed to start.\n");
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
  });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
