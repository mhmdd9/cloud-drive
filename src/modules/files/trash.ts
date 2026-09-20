import "server-only";
import { getDb } from "@/lib/db";
import { deleteObject, type Storage } from "@/lib/storage";
import { getConfiguredTrashRetentionDays } from "@/modules/admin/settings";
import { recordAudit } from "@/modules/audit/service";

export async function purgeExpiredTrash(storage: Storage): Promise<number> {
  const retentionDays = await getConfiguredTrashRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const files = await getDb().file.findMany({ where: { deletedAt: { not: null, lte: cutoff } }, select: { id: true, ownerId: true, name: true, objectKey: true, versionId: true } });
  let purged = 0;
  for (const file of files) {
    try {
      await deleteObject(storage, file.objectKey, file.versionId ?? undefined);
      const deleted = await getDb().file.deleteMany({ where: { id: file.id, deletedAt: { not: null, lte: cutoff } } });
      if (deleted.count === 1) {
        purged += 1;
        await recordAudit({ actorId: file.ownerId, action: "FILE_PURGED", entityType: "File", entityId: file.id, metadata: { name: file.name, retentionDays } });
      }
    } catch (error) {
      console.error("Trash purge failed", file.id, error);
    }
  }
  return purged;
}
