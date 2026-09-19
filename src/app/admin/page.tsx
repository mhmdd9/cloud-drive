"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = { id: string; name: string; email: string; username: string | null; active: boolean; roles: string[] };
type AuditLog = { id: string; action: string; entityType: string | null; entityId: string | null; metadata: unknown; ipAddress: string | null; success: boolean; createdAt: string; actor: { name: string; email: string; username: string | null } | null };
type Dashboard = { overview: { users: number; activeUsers: number; files: number; storageBytes: string; shares: number; links: number }; fileStatuses: Record<"READY" | "PROCESSING" | "PENDING" | "REJECTED", number>; activity: { date: string; label: string; total: number; uploads: number; downloads: number; shares: number; logins: number }[]; recentLogs: (Pick<AuditLog, "id" | "action" | "success" | "createdAt"> & { actor: { name: string; email: string } | null })[] };

const emptyForm = { name: "", email: "", username: "", password: "", roles: "user" };
const auditLabels: Record<string, string> = { LOGIN_SUCCESS: "ورود موفق", LOGIN_FAILURE: "ورود ناموفق", LOGOUT: "خروج", FILE_UPLOAD_INITIATED: "شروع آپلود فایل", FILE_UPLOAD_COMPLETED: "تکمیل آپلود فایل", FILE_DOWNLOADED: "دانلود فایل", SHARED_FILE_DOWNLOADED: "دانلود فایل اشتراکی", FILE_DELETED: "حذف فایل", FILE_SHARED: "اشتراک فایل", FILE_SHARE_UPDATED: "به‌روزرسانی اشتراک", FILE_SHARE_REVOKED: "لغو اشتراک", PUBLIC_LINK_CREATED: "ساخت لینک عمومی", PUBLIC_LINK_REVOKED: "لغو لینک عمومی", PUBLIC_LINK_DOWNLOADED: "دانلود از لینک عمومی", USER_CREATED: "ایجاد کاربر", USER_UPDATED: "ویرایش کاربر", SETTING_UPDATED: "تغییر تنظیمات", DEVICE_IDENTITY_CREATED: "ایجاد هویت دستگاه" };

function formatBytes(value: number) {
  if (value < 1024) return `${value} بایت`;
  const units = ["کیلوبایت", "مگابایت", "گیگابایت", "ترابایت"];
  let size = value; let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

function actionLabel(action: string) { return auditLabels[action] || action; }

function StatCard({ label, value, detail, color }: { label: string; value: string; detail: string; color: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className={`mb-5 flex h-10 w-10 items-center justify-center rounded-xl ${color} text-lg`}>◈</div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>;
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [maxUploadBytes, setMaxUploadBytes] = useState(104857600);
  const [form, setForm] = useState(emptyForm);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const responses = await Promise.all([fetch("/api/admin/users", { cache: "no-store" }), fetch("/api/admin/settings", { cache: "no-store" }), fetch("/api/admin/audit-logs", { cache: "no-store" }), fetch("/api/admin/dashboard", { cache: "no-store" })]);
      if (responses[0].status === 401) return router.replace("/login");
      if (responses[0].status === 403) throw new Error("دسترسی ادمین ندارید.");
      if (responses.some((response) => !response.ok)) throw new Error("دریافت اطلاعات مدیریت انجام نشد.");
      setUsers((await responses[0].json()).users);
      setMaxUploadBytes((await responses[1].json()).maxUploadBytes);
      setAuditLogs((await responses[2].json()).logs);
      setDashboard(await responses[3].json());
    } catch (reason) { setError(reason instanceof Error ? reason.message : "خطا در دریافت اطلاعات مدیریت."); } finally { setLoading(false); }
  }

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, username: form.username || null, roles: [form.roles] }) }); if (!response.ok) throw new Error((await response.json()).error || "ایجاد کاربر انجام نشد."); setForm(emptyForm); setMessage("کاربر ایجاد شد."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "ایجاد کاربر انجام نشد."); } finally { setSaving(false); }
  }

  async function updateUser(id: string, body: Record<string, unknown>) {
    setError(""); const response = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error((await response.json()).error || "ویرایش کاربر انجام نشد.");
    await load();
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxUploadBytes }) }); if (!response.ok) throw new Error((await response.json()).error || "ذخیره تنظیمات انجام نشد."); setMessage("تنظیمات ذخیره شد."); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیره تنظیمات انجام نشد."); } finally { setSaving(false); }
  }

  const maxActivity = Math.max(1, ...(dashboard?.activity.map((item) => item.total) || [1]));
  const statusTotal = dashboard ? Object.values(dashboard.fileStatuses).reduce((sum, value) => sum + value, 0) : 0;
  const readyPercent = statusTotal ? Math.round((dashboard!.fileStatuses.READY / statusTotal) * 100) : 0;

  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-6 text-slate-900 sm:px-8 lg:px-10"><div className="mx-auto max-w-7xl"><header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-5 sm:flex-row sm:items-center"><div><Link href="/drive" className="text-sm font-bold text-blue-700">بازگشت به فایل‌ها</Link><h1 className="mt-4 text-2xl font-bold">داشبورد مدیریت سامانه</h1><p className="mt-1 text-sm text-slate-500">نمای کلی وضعیت کاربران، فایل‌ها و رویدادهای امنیتی</p></div><span className="w-fit rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">پنل مدیر سامانه</span></header>
    {(error || message) && <p role={error ? "alert" : "status"} className={`mt-5 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}

    <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><StatCard label="کاربران سامانه" value={(dashboard?.overview.users || users.length).toLocaleString("fa-IR")} detail={`${(dashboard?.overview.activeUsers || 0).toLocaleString("fa-IR")} کاربر فعال`} color="bg-blue-50 text-blue-600" /><StatCard label="اسناد و فایل‌ها" value={(dashboard?.overview.files || 0).toLocaleString("fa-IR")} detail={`${readyPercent.toLocaleString("fa-IR")}٪ آماده استفاده`} color="bg-emerald-50 text-emerald-600" /><StatCard label="فضای مصرف‌شده" value={formatBytes(Number(dashboard?.overview.storageBytes || 0))} detail="در فضای ذخیره‌سازی سازمان" color="bg-violet-50 text-violet-600" /><StatCard label="اشتراک‌های فعال" value={(dashboard?.overview.shares || 0).toLocaleString("fa-IR")} detail={`${(dashboard?.overview.links || 0).toLocaleString("fa-IR")} لینک عمومی فعال`} color="bg-amber-50 text-amber-600" /></section>

    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">روند فعالیت سامانه</h2><p className="mt-1 text-xs text-slate-500">فعالیت ثبت‌شده در هفت روز گذشته</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">۷ روز اخیر</span></div><div className="mt-8 flex h-48 items-end gap-2 sm:gap-4">{(dashboard?.activity || []).map((item) => <div key={item.date} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><div className="flex h-full w-full items-end justify-center"><div title={`${item.total.toLocaleString("fa-IR")} رویداد`} className="w-full max-w-10 rounded-t-xl bg-gradient-to-t from-blue-600 to-cyan-400 transition hover:from-blue-700" style={{ height: `${Math.max(item.total ? 10 : 3, (item.total / maxActivity) * 100)}%` }} /></div><span className="text-[10px] text-slate-400">{item.label}</span></div>)}</div><div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span><i className="ml-1 inline-block h-2 w-2 rounded-full bg-blue-500" />کل رویدادها</span><span>آپلود: {(dashboard?.activity.reduce((sum, item) => sum + item.uploads, 0) || 0).toLocaleString("fa-IR")}</span><span>دانلود: {(dashboard?.activity.reduce((sum, item) => sum + item.downloads, 0) || 0).toLocaleString("fa-IR")}</span><span>ورود: {(dashboard?.activity.reduce((sum, item) => sum + item.logins, 0) || 0).toLocaleString("fa-IR")}</span></div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">وضعیت فایل‌ها</h2><p className="mt-1 text-xs text-slate-500">توزیع فایل‌ها بر اساس وضعیت پردازش</p><div className="mx-auto mt-7 flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(#10b981 0 ${statusTotal ? (dashboard!.fileStatuses.READY / statusTotal) * 100 : 0}%, #f59e0b 0 ${statusTotal ? ((dashboard!.fileStatuses.READY + dashboard!.fileStatuses.PROCESSING) / statusTotal) * 100 : 0}%, #cbd5e1 0 100%)` }}><div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white"><span className="text-2xl font-bold">{readyPercent.toLocaleString("fa-IR")}٪</span><span className="text-[10px] text-slate-400">آماده</span></div></div><div className="mt-6 space-y-3 text-xs"><div className="flex justify-between"><span><i className="ml-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />آماده</span><b>{(dashboard?.fileStatuses.READY || 0).toLocaleString("fa-IR")}</b></div><div className="flex justify-between"><span><i className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-500" />در حال پردازش</span><b>{((dashboard?.fileStatuses.PROCESSING || 0) + (dashboard?.fileStatuses.PENDING || 0)).toLocaleString("fa-IR")}</b></div><div className="flex justify-between"><span><i className="ml-2 inline-block h-2 w-2 rounded-full bg-slate-300" />رد شده</span><b>{(dashboard?.fileStatuses.REJECTED || 0).toLocaleString("fa-IR")}</b></div></div></div></section>

    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">کاربران سامانه</h2><p className="mt-1 text-xs text-slate-500">مدیریت نقش و وضعیت حساب‌های سازمانی</p></div><span className="text-xs text-slate-400">{users.length.toLocaleString("fa-IR")} کاربر</span></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead className="border-b border-slate-100 text-xs text-slate-400"><tr><th className="pb-3">نام</th><th className="pb-3">ایمیل</th><th className="pb-3">نقش</th><th className="pb-3">وضعیت</th><th className="pb-3">عملیات</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="py-8 text-center text-slate-500">در حال دریافت...</td></tr> : users.map((user) => <tr key={user.id}><td className="py-4 font-bold">{user.name}<span className="mt-1 block text-xs font-normal text-slate-400">{user.username || "بدون username"}</span></td><td className="py-4 text-slate-500">{user.email}</td><td className="py-4"><select value={user.roles[0] || "user"} onChange={(event) => void updateUser(user.id, { roles: [event.target.value] }).catch((reason) => setError(reason.message))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs"><option value="user">کاربر</option><option value="management">مدیریت</option><option value="deputy">معاون</option><option value="admin">ادمین</option></select></td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.active ? "فعال" : "غیرفعال"}</span></td><td className="py-4"><div className="flex gap-2"><button onClick={() => void updateUser(user.id, { active: !user.active }).catch((reason) => setError(reason.message))} className="text-xs font-bold text-blue-700">{user.active ? "غیرفعال‌سازی" : "فعال‌سازی"}</button><button onClick={() => { const password = window.prompt("رمز جدید حداقل ۱۲ کاراکتر:"); if (password) void updateUser(user.id, { password }).catch((reason) => setError(reason.message)); }} className="text-xs font-bold text-slate-500">تغییر رمز</button></div></td></tr>)}</tbody></table></div></div><div className="space-y-6"><form onSubmit={createUser} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">ایجاد کاربر</h2><p className="mt-1 text-xs text-slate-500">افزودن حساب جدید به سازمان</p><div className="mt-4 space-y-3"><input required placeholder="نام کامل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" /><input required type="email" placeholder="ایمیل سازمانی" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" /><input placeholder="username اختیاری" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" /><input required type="password" minLength={12} placeholder="رمز عبور حداقل ۱۲ کاراکتر" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" /><select value={form.roles} onChange={(e) => setForm({ ...form, roles: e.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm"><option value="user">کاربر</option><option value="management">مدیریت</option><option value="deputy">معاون</option><option value="admin">ادمین</option></select><button disabled={saving} className="w-full rounded-xl bg-blue-600 p-2.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 disabled:opacity-50">ایجاد کاربر</button></div></form><form onSubmit={saveSettings} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold">تنظیمات فایل</h2><label className="mt-4 block text-sm text-slate-600">حداکثر حجم آپلود (مگابایت)<input required type="number" min={1} max={10240} value={Math.round(maxUploadBytes / 1048576)} onChange={(e) => setMaxUploadBytes(Number(e.target.value) * 1048576)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm" /></label><button disabled={saving} className="mt-4 w-full rounded-xl border border-blue-200 p-2.5 text-sm font-bold text-blue-700 disabled:opacity-50">ذخیره تنظیمات</button></form></div></section>

    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-bold">رویدادهای اخیر امنیتی</h2><p className="mt-1 text-xs text-slate-500">آخرین فعالیت‌های ثبت‌شده در سامانه</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">{auditLogs.length.toLocaleString("fa-IR")} رویداد</span></div><div className="mt-5 grid gap-3 md:grid-cols-2">{auditLogs.slice(0, 8).map((log) => <div key={log.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"><div><p className="text-sm font-bold">{actionLabel(log.action)}</p><p className="mt-1 text-xs text-slate-500">{log.actor?.name || "کاربر ناشناس"} · {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.createdAt))}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${log.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{log.success ? "موفق" : "ناموفق"}</span></div>)}{auditLogs.length === 0 && <p className="py-6 text-center text-sm text-slate-500 md:col-span-2">هنوز رویدادی ثبت نشده است.</p>}</div></section>
  </div></main>;
}
