import { apiError } from "@/lib/http";
import { getDb } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { requirePermission } from "@/modules/admin/service";

export const runtime = "nodejs";

const activityActions = ["FILE_UPLOAD_COMPLETED", "FILE_DOWNLOADED", "SHARED_FILE_DOWNLOADED", "FILE_SHARED", "PUBLIC_LINK_CREATED", "LOGIN_SUCCESS"] as const;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const actor = await requireUser();
    await requirePermission(actor, "users.manage");
    const db = getDb();
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 6);

    const [users, activeUsers, files, fileStatuses, storage, shares, links, activities, recentLogs] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { active: true } }),
      db.file.count({ where: { deletedAt: null } }),
      db.file.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
      db.file.aggregate({ where: { deletedAt: null }, _sum: { size: true } }),
      db.fileShare.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }], file: { deletedAt: null } } }),
      db.sharedLink.count({ where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
      db.auditLog.findMany({ where: { createdAt: { gte: since }, action: { in: [...activityActions] } }, select: { action: true, createdAt: true } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, action: true, success: true, createdAt: true, actor: { select: { name: true, email: true } } } }),
    ]);

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(since);
      date.setDate(since.getDate() + index);
      return { date: dayKey(date), label: new Intl.DateTimeFormat("fa-IR", { weekday: "short" }).format(date), total: 0, uploads: 0, downloads: 0, shares: 0, logins: 0 };
    });
    const byDay = new Map(days.map((day) => [day.date, day]));
    for (const activity of activities) {
      const day = byDay.get(dayKey(new Date(activity.createdAt)));
      if (!day) continue;
      day.total += 1;
      if (activity.action === "FILE_UPLOAD_COMPLETED") day.uploads += 1;
      if (activity.action === "FILE_DOWNLOADED" || activity.action === "SHARED_FILE_DOWNLOADED") day.downloads += 1;
      if (activity.action === "FILE_SHARED" || activity.action === "PUBLIC_LINK_CREATED") day.shares += 1;
      if (activity.action === "LOGIN_SUCCESS") day.logins += 1;
    }

    const statusMap = Object.fromEntries(fileStatuses.map((item) => [item.status, item._count._all]));
    return Response.json({
      overview: { users, activeUsers, files, storageBytes: storage._sum.size?.toString() ?? "0", shares, links },
      fileStatuses: { READY: statusMap.READY ?? 0, PROCESSING: statusMap.PROCESSING ?? 0, PENDING: statusMap.PENDING ?? 0, REJECTED: statusMap.REJECTED ?? 0 },
      activity: days,
      recentLogs,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
