import { SignJWT } from "jose";
import { ApiError, apiError, noStoreHeaders } from "@/lib/http";
import { requireUser } from "@/modules/auth/session";
import { auditContext, recordAudit } from "@/modules/audit/service";
import { excelConfig, findExcel, signExcelAccess } from "@/modules/files/excel";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await params;
    const file = await findExcel(id, actor.id);
    const config = excelConfig();
    const downloadToken = await signExcelAccess({ id, actorId: actor.id, key: file.key, purpose: "download" });
    const callbackToken = await signExcelAccess({ id, actorId: actor.id, key: file.key, purpose: "callback" });
    const editor = {
      documentType: "cell",
      type: "desktop",
      width: "100%",
      height: "800px",
      document: {
        fileType: "xlsx", key: file.key, title: file.name.slice(0, 128),
        url: `${config.appUrl}/api/excel/${id}/content?token=${encodeURIComponent(downloadToken)}`,
        permissions: { edit: file.canEdit, download: file.canEdit || file.ownerId === actor.id || file.shares.some((share) => share.permission === "DOWNLOAD"), print: false, copy: file.canEdit },
      },
      editorConfig: {
        mode: file.canEdit ? "edit" : "view", lang: "en",
        callbackUrl: `${config.appUrl}/api/excel/${id}/callback?token=${encodeURIComponent(callbackToken)}`,
        user: { id: actor.id, name: actor.name },
        customization: { forcesave: false },
      },
    };
    const token = await new SignJWT(editor).setProtectedHeader({ alg: "HS256" }).sign(config.secret);
    await recordAudit({ actorId: actor.id, action: "EXCEL_OPENED", entityType: "File", entityId: id, ...auditContext(request) });
    return Response.json({ name: file.name, canEdit: file.canEdit, isOwner: file.ownerId === actor.id, publicUrl: config.publicUrl, editor: { ...editor, token } }, { headers: noStoreHeaders });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("Excel editor configuration failed", error);
    return apiError(error);
  }
}
