import { getDb } from "@/lib/db";
import { maxUploadBytes } from "@/modules/files/validation";

export const MAX_UPLOAD_SETTING = "max_upload_bytes";
export const TRASH_RETENTION_SETTING = "trash_retention_days";
export const DEFAULT_TRASH_RETENTION_DAYS = 30;

export async function getConfiguredMaxUploadBytes(): Promise<number> {
  const setting = await getDb().systemSetting.findUnique({ where: { key: MAX_UPLOAD_SETTING } });
  return maxUploadBytes(setting?.value ?? process.env.MAX_UPLOAD_BYTES);
}

export async function getConfiguredTrashRetentionDays(): Promise<number> {
  const setting = await getDb().systemSetting.findUnique({ where: { key: TRASH_RETENTION_SETTING } });
  const value = Number(setting?.value ?? DEFAULT_TRASH_RETENTION_DAYS);
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : DEFAULT_TRASH_RETENTION_DAYS;
}
