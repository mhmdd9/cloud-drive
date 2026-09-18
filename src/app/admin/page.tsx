"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type AdminUser = { id: string; name: string; email: string; username: string | null; active: boolean; roles: string[] };

const emptyForm = { name: "", email: "", username: "", password: "", roles: "user" };

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [maxUploadBytes, setMaxUploadBytes] = useState(104857600);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [usersResponse, settingsResponse] = await Promise.all([fetch("/api/admin/users", { cache: "no-store" }), fetch("/api/admin/settings", { cache: "no-store" })]);
      if (usersResponse.status === 401) return router.replace("/login");
      if (usersResponse.status === 403) throw new Error("دسترسی ادمین ندارید.");
      if (!usersResponse.ok || !settingsResponse.ok) throw new Error("دریافت اطلاعات مدیریت انجام نشد.");
      setUsers((await usersResponse.json()).users);
      setMaxUploadBytes((await settingsResponse.json()).maxUploadBytes);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "خطا در دریافت اطلاعات مدیریت.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, username: form.username || null, roles: [form.roles] }) });
      if (!response.ok) throw new Error((await response.json()).error || "ایجاد کاربر انجام نشد.");
      setForm(emptyForm); setMessage("کاربر ایجاد شد."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ایجاد کاربر انجام نشد."); } finally { setSaving(false); }
  }

  async function updateUser(id: string, body: Record<string, unknown>) {
    setError("");
    const response = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error((await response.json()).error || "ویرایش کاربر انجام نشد.");
    await load();
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { const response = await fetch("/api/admin/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxUploadBytes }) }); if (!response.ok) throw new Error((await response.json()).error || "ذخیره تنظیمات انجام نشد."); setMessage("تنظیمات ذخیره شد."); } catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیره تنظیمات انجام نشد."); } finally { setSaving(false); }
  }

  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-6 text-slate-900 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <header className="flex items-center justify-between border-b border-slate-200 pb-5"><div><Link href="/drive" className="text-sm text-blue-700">← بازگشت به فایل‌ها</Link><h1 className="mt-3 text-2xl font-bold">مدیریت سامانه</h1><p className="mt-1 text-sm text-slate-500">مدیریت کاربران و تنظیمات اصلی فضای ابری</p></div><span className="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">پنل ادمین</span></header>
      {(error || message) && <p role={error ? "alert" : "status"} className={`mt-5 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}
      <section className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-bold">کاربران</h2><span className="text-xs text-slate-400">{users.length.toLocaleString("fa-IR")} کاربر</span></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-right text-sm"><thead className="border-b border-slate-100 text-xs text-slate-400"><tr><th className="pb-3">نام</th><th className="pb-3">ایمیل</th><th className="pb-3">نقش</th><th className="pb-3">وضعیت</th><th className="pb-3">عملیات</th></tr></thead><tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={5} className="py-8 text-center text-slate-500">در حال دریافت...</td></tr> : users.map((user) => <tr key={user.id}><td className="py-4 font-bold">{user.name}<span className="mt-1 block text-xs font-normal text-slate-400">{user.username || "بدون username"}</span></td><td className="py-4 text-slate-500">{user.email}</td><td className="py-4"><select value={user.roles[0] || "user"} onChange={(event) => void updateUser(user.id, { roles: [event.target.value] }).catch((reason) => setError(reason.message))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs"><option value="user">کاربر</option><option value="management">مدیریت</option><option value="deputy">معاون</option><option value="admin">ادمین</option></select></td><td className="py-4"><span className={`rounded-full px-2.5 py-1 text-xs ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.active ? "فعال" : "غیرفعال"}</span></td><td className="py-4"><div className="flex gap-2"><button onClick={() => void updateUser(user.id, { active: !user.active }).catch((reason) => setError(reason.message))} className="text-xs font-bold text-blue-700">{user.active ? "غیرفعال‌سازی" : "فعال‌سازی"}</button><button onClick={() => { const password = window.prompt("رمز جدید حداقل ۱۲ کاراکتر:"); if (password) void updateUser(user.id, { password }).catch((reason) => setError(reason.message)); }} className="text-xs font-bold text-slate-500">تغییر رمز</button></div></td></tr>)}</tbody></table></div></div>
        <div className="space-y-6"><form onSubmit={createUser} className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">ایجاد کاربر</h2><div className="mt-4 space-y-3"><input required placeholder="نام کامل" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /><input required type="email" placeholder="ایمیل" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /><input placeholder="username اختیاری" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /><input required type="password" minLength={12} placeholder="رمز عبور حداقل ۱۲ کاراکتر" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm" /><select value={form.roles} onChange={(e) => setForm({ ...form, roles: e.target.value })} className="w-full rounded-lg border border-slate-200 p-2.5 text-sm"><option value="user">کاربر</option><option value="management">مدیریت</option><option value="deputy">معاون</option><option value="admin">ادمین</option></select><button disabled={saving} className="w-full rounded-lg bg-blue-700 p-2.5 text-sm font-bold text-white disabled:opacity-50">ایجاد کاربر</button></div></form>
          <form onSubmit={saveSettings} className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">تنظیمات فایل</h2><label className="mt-4 block text-sm text-slate-600">حداکثر حجم آپلود (مگابایت)<input required type="number" min={1} max={10240} value={Math.round(maxUploadBytes / 1048576)} onChange={(e) => setMaxUploadBytes(Number(e.target.value) * 1048576)} className="mt-2 w-full rounded-lg border border-slate-200 p-2.5 text-sm" /></label><button disabled={saving} className="mt-4 w-full rounded-lg border border-blue-200 p-2.5 text-sm font-bold text-blue-700 disabled:opacity-50">ذخیره تنظیمات</button></form></div>
      </section>
    </div>
  </main>;
}
