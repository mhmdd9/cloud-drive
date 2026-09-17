export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export const noStoreHeaders = { "Cache-Control": "no-store" };

export function apiError(error: unknown): Response {
  const known = error instanceof ApiError && error.status >= 400 && error.status < 500;
  return Response.json(
    { error: known ? error.message : "Internal server error" },
    { status: known ? error.status : 500, headers: noStoreHeaders },
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = process.env.APP_ORIGIN;
  if (!origin) throw new Error("APP_ORIGIN is required");
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
    throw new Error("APP_ORIGIN must be an exact HTTP origin");
  }
  if (request.headers.get("origin") !== origin) {
    throw new ApiError(403, "Forbidden origin");
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Content-Type must be application/json");
  }
  const limit = 16 * 1024;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    throw new ApiError(413, "Request body too large");
  }
  if (!request.body) throw new ApiError(400, "Invalid JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, "Request body too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "Invalid JSON");
  } finally {
    reader.releaseLock();
  }
}
