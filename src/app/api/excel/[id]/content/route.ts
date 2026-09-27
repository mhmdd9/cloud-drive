import { GetObjectCommand } from "@aws-sdk/client-s3";
import { ApiError, apiError, noStoreHeaders } from "@/lib/http";
import { createStorage } from "@/lib/storage";
import { findExcel, verifyExcelAccess, EXCEL_MIME_TYPE } from "@/modules/files/excel";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const claim = await verifyExcelAccess(new URL(request.url).searchParams.get("token"), id, "download");
    const file = await findExcel(id, claim.actorId);
    if (file.key !== claim.key) throw new ApiError(409, "File version changed");
    const storage = createStorage();
    try {
      const object = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: file.objectKey, VersionId: file.versionId }));
      if (!object.Body || object.ContentLength !== Number(file.size)) throw new ApiError(409, "Stored file is unavailable");
      const bytes = await object.Body.transformToByteArray();
      if (bytes.length !== Number(file.size)) throw new ApiError(409, "Stored file is incomplete");
      return new Response(Uint8Array.from(bytes).buffer, { headers: { ...noStoreHeaders, "Content-Type": EXCEL_MIME_TYPE, "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff" } });
    } finally { storage.client.destroy(); }
  } catch (error) { return apiError(error); }
}
