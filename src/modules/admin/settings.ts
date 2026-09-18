import { getDb } from "@/lib/db";
import { maxUploadBytes } from "@/modules/files/validation";

export const MAX_UPLOAD_SETTING = "max_upload_bytes";

export async function getConfiguredMaxUploadBytes(): Promise<number> {
  const setting = await getDb().systemSetting.findUnique({ where: { key: MAX_UPLOAD_SETTING } });
  return maxUploadBytes(setting?.value ?? process.env.MAX_UPLOAD_BYTES);
}
