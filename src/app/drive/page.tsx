"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type User = { name: string; email: string; roles: string[] };
type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  status: "PENDING" | "PROCESSING" | "READY" | "REJECTED";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

const statusLabels: Record<DriveFile["status"], string> = {
  READY: "آماده",
  PROCESSING: "در حال پردازش",
  PENDING: "در انتظار آپلود",
  REJECTED: "رد شده",
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} بایت`;
  const units = ["کیلوبایت", "مگابایت", "گیگابایت", "ترابایت"];
  let size = value;
  let unit = -1;
  do {
    size /= 1024;
    unit += 1;
  } while (size >= 1024 && unit < units.length - 1);
  return `${size.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return "▧";
  if (mimeType.includes("pdf")) return "▤";
  if (mimeType.includes("word") || mimeType.includes("document")) return "▥";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "▦";
  return "▱";
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "ک";
}

async function sha256Base64(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  let binary = "";
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function DrivePage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [trashView, setTrashView] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [shareFile, setShareFile] = useState<DriveFile | null>(null);
  const [shareIdentifier, setShareIdentifier] = useState("");
  const [sharePermission, setSharePermission] = useState<"VIEW" | "DOWNLOAD">("DOWNLOAD");
  const [shareLink, setShareLink] = useState("");
  const [shareLinkId, setShareLinkId] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [shareFeedbackError, setShareFeedbackError] = useState("");

  async function loadDrive(trash = trashView) {
    setLoading(true);
    try {
      const [meResponse, filesResponse] = await Promise.all([
        fetch("/api/auth/me", { cache: "no-store" }),
        fetch(`/api/files${trash ? "?trash=true" : ""}`, { cache: "no-store" }),
      ]);
      if (meResponse.status === 401 || filesResponse.status === 401) {
        router.replace("/login");
        return;
      }
      if (!meResponse.ok || !filesResponse.ok) throw new Error("load");
      const me = await meResponse.json();
      const fileData = await filesResponse.json();
      setUser(me.user);
      setFiles(fileData.files);
    } catch {
      setError("دریافت اطلاعات فضای ابری انجام نشد. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadDrive(trashView); }, [trashView]);

  const hasPendingFiles = files.some((file) => file.status === "PENDING" || file.status === "PROCESSING");
  useEffect(() => {
    if (trashView || !hasPendingFiles) return;
    const timer = window.setInterval(() => { void loadDrive(false); }, 2500);
    return () => window.clearInterval(timer);
  }, [trashView, hasPendingFiles]);

  async function upload(file: File) {
    setUploading(true);
    setError("");
    setMessage("در حال آماده‌سازی فایل...");
    try {
      const checksum = await sha256Base64(file);
      const metadataResponse = await fetch("/api/files/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, mimeType: file.type || "application/octet-stream", size: file.size, checksum }),
      });
      if (metadataResponse.status === 401) return router.replace("/login");
      if (!metadataResponse.ok) throw new Error("metadata");
      const uploadData = await metadataResponse.json() as { fileId: string; url: string; headers: Record<string, string> };
      setMessage("در حال آپلود فایل...");
      const headers = Object.fromEntries(Object.entries(uploadData.headers).filter(([name]) => name.toLowerCase() !== "content-length"));
      const putResponse = await fetch(uploadData.url, { method: "PUT", headers, body: file });
      if (!putResponse.ok) throw new Error("put");
      setMessage("در حال نهایی‌سازی فایل...");
      const completeResponse = await fetch(`/api/files/${uploadData.fileId}/complete`, { method: "POST" });
      if (!completeResponse.ok) throw new Error("complete");
      setMessage("فایل با موفقیت اضافه شد.");
      await loadDrive(trashView);
    } catch {
      setError("آپلود فایل انجام نشد. حجم یا نوع فایل را بررسی کنید.");
      setMessage("");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function restoreFile(id: string) {
    setDeletingId(id); setError("");
    try {
      const response = await fetch(`/api/files/${id}/restore`, { method: "POST" });
      if (!response.ok) throw new Error("بازیابی فایل انجام نشد.");
      await loadDrive(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "بازیابی فایل انجام نشد.");
    } finally { setDeletingId(null); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function deleteFile(id: string) {
    if (!window.confirm("این فایل به سطل زباله منتقل شود؟")) return;
    setDeletingId(id); setError("");
    try {
      const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("حذف فایل انجام نشد.");
      await loadDrive();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "حذف فایل انجام نشد.");
    } finally { setDeletingId(null); }
  }

  async function shareWithUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shareFile) return;
    setShareBusy(true); setError(""); setMessage(""); setShareFeedback(""); setShareFeedbackError("");
    try {
      const response = await fetch("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: shareFile.id, identifier: shareIdentifier, permission: sharePermission }) });
      if (!response.ok) throw new Error((await response.json()).error || "اشتراک‌گذاری انجام نشد.");
      setMessage("فایل با موفقیت با کاربر به اشتراک گذاشته شد."); setShareIdentifier("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "اشتراک‌گذاری انجام نشد."); } finally { setShareBusy(false); }
  }

  async function createPublicLink() {
    if (!shareFile) return;
    setShareBusy(true); setError("");
    try {
      const response = await fetch("/api/links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: shareFile.id, permission: "DOWNLOAD", expiresInHours: 168 }) });
      if (!response.ok) throw new Error((await response.json()).error || "ساخت لینک انجام نشد.");
      const result = await response.json(); setShareLink(result.link.url); setShareLinkId(result.link.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ساخت لینک انجام نشد."); } finally { setShareBusy(false); }
  }

  const filteredFiles = useMemo(() => files.filter((file) => file.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [files, search]);
  const totalSize = files.reduce((sum, file) => sum + Number(file.size), 0);
  const readyCount = files.filter((file) => file.status === "READY").length;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <aside className="hidden w-64 shrink-0 border-l border-slate-200 bg-white px-5 py-7 lg:flex lg:flex-col">
          <Link href="/drive" className="flex items-center gap-3 px-2 text-lg font-bold">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white">ک</span>
            فضای ابری
          </Link>
          <nav className="mt-12 space-y-2 text-sm">
            <Link href="/drive" className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 font-bold text-blue-700"><span>▦</span> فایل‌های من</Link>
            <button onClick={() => setTrashView(true)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-right transition ${trashView ? "bg-blue-50 font-bold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><span>♲</span> سطل زباله</button>
            <Link href="/drive/shared" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 transition hover:bg-slate-50"><span>♧</span> اشتراک‌گذاری</Link>
            {user?.roles.includes("admin") && <Link href="/admin" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 transition hover:bg-slate-50"><span>⚙</span> مدیریت سامانه</Link>}
            <span className="flex cursor-not-allowed items-center gap-3 rounded-xl px-4 py-3 text-slate-400"><span>⚙</span> تنظیمات</span>
          </nav>
          <div className="mt-auto rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
            <p className="font-bold text-slate-700">فضای ذخیره‌سازی</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-[18%] rounded-full bg-blue-600" /></div>
            <p className="mt-2">{formatBytes(totalSize)} استفاده شده</p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-5 py-5 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div><p className="text-sm text-slate-500">داشبورد</p><h1 className="mt-1 text-xl font-bold sm:text-2xl">فایل‌های من</h1></div>
            <div className="flex items-center gap-3">
              <div className="hidden text-left sm:block"><p className="text-sm font-bold">{user?.name || "کاربر"}</p><p className="text-xs text-slate-500">{user?.email || ""}</p></div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 font-bold text-blue-700">{initials(user?.name || "کاربر")}</div>
              <button onClick={logout} className="hidden rounded-lg px-2 py-2 text-xs text-slate-500 transition hover:bg-slate-100 sm:block">خروج</button>
            </div>
          </header>

          <section className="mt-7 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">مجموع فایل‌ها</p><p className="mt-3 text-2xl font-bold">{files.length.toLocaleString("fa-IR")}</p><p className="mt-1 text-xs text-slate-400">فایل ثبت‌شده</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">فضای مصرف‌شده</p><p className="mt-3 text-2xl font-bold">{formatBytes(totalSize)}</p><p className="mt-1 text-xs text-slate-400">از فضای سازمانی</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">فایل‌های آماده</p><p className="mt-3 text-2xl font-bold">{readyCount.toLocaleString("fa-IR")}</p><p className="mt-1 text-xs text-emerald-600">قابل استفاده</p></div>
          </section>

          <section className="mt-8 rounded-3xl bg-gradient-to-l from-blue-700 to-blue-600 p-6 text-white shadow-lg shadow-blue-100 sm:p-8">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><p className="text-sm text-blue-100">فضای کاری امن شما</p><h2 className="mt-2 text-2xl font-bold">فایل جدیدی اضافه کنید</h2><p className="mt-2 max-w-lg text-sm leading-7 text-blue-100">فایل‌ها را در فضای سازمانی ذخیره کنید و در مراحل بعدی با همکاران خود به اشتراک بگذارید.</p></div><label className={`inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 ${uploading ? "pointer-events-none opacity-60" : ""}`}><input ref={inputRef} type="file" className="sr-only" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />{uploading ? "در حال آپلود..." : "+ انتخاب فایل"}</label></div>
          </section>

          <section className="mt-8">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><h2 className="text-lg font-bold">{trashView ? "سطل زباله" : "فایل‌های اخیر"}</h2><div className="relative"><span className="pointer-events-none absolute right-3 top-2.5 text-slate-400">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجوی فایل" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-9 pl-4 text-sm outline-none transition focus:border-blue-500 sm:w-64" /></div></div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_110px_140px] gap-4 border-b border-slate-100 px-5 py-3 text-xs font-bold text-slate-400 sm:grid"><span>نام فایل</span><span>حجم</span><span>آخرین تغییر</span><span>وضعیت</span><span>عملیات</span></div>
              {loading ? <div className="p-10 text-center text-sm text-slate-500">در حال دریافت فایل‌ها...</div> : filteredFiles.length === 0 ? <div className="p-10 text-center"><p className="font-bold">{trashView ? "سطل زباله خالی است" : "هنوز فایلی ندارید"}</p><p className="mt-2 text-sm text-slate-500">{trashView ? "فایل‌های حذف‌شده اینجا نمایش داده می‌شوند." : "با انتخاب فایل، اولین مورد را به فضای ابری اضافه کنید."}</p></div> : <div className="divide-y divide-slate-100">{filteredFiles.map((file) => <div key={file.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,2fr)_1fr_1fr_110px_190px] sm:items-center sm:gap-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600">{fileIcon(file.mimeType)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{file.name}</p><p className="mt-1 text-xs text-slate-400">{file.mimeType}</p></div></div><span className="text-xs text-slate-500">{formatBytes(Number(file.size))}</span><span className="text-xs text-slate-500">{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" }).format(new Date(file.updatedAt))}</span><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${file.status === "READY" ? "bg-emerald-50 text-emerald-700" : file.status === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>{statusLabels[file.status]}</span><div className="flex gap-3">{trashView ? <button disabled={deletingId === file.id} onClick={() => void restoreFile(file.id)} className="text-xs font-bold text-blue-700 disabled:opacity-50">{deletingId === file.id ? "..." : "بازیابی"}</button> : <><>{file.status === "READY" ? <><a href={`/api/files/${file.id}/download`} className="text-xs font-bold text-blue-700 hover:text-blue-900">دانلود</a><button onClick={() => { setShareFile(file); setShareLink(""); setError(""); }} className="text-xs font-bold text-indigo-700">اشتراک</button></> : <span className="text-xs text-slate-300">—</span>}</><button disabled={deletingId === file.id} onClick={() => void deleteFile(file.id)} className="text-xs font-bold text-red-600 disabled:opacity-50">{deletingId === file.id ? "..." : "حذف"}</button></>}</div></div>)}</div>}
            </div>
            {(message || error) && <p role={error ? "alert" : "status"} className={`mt-3 text-sm ${error ? "text-red-600" : "text-blue-700"}`}>{error || message}</p>}
          </section>
        </main>
      </div>
      {shareFile && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareFile(null); }}><section className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">اشتراک‌گذاری فایل</h2><p className="mt-1 max-w-xs truncate text-xs text-slate-500">{shareFile.name}</p></div><button onClick={() => setShareFile(null)} className="text-xl text-slate-400">×</button></div>{(shareFeedback || error || message) && <p role={error ? "alert" : "status"} className={`mt-4 rounded-xl px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || shareFeedback || message}</p>}<form onSubmit={shareWithUser} className="mt-6 space-y-3"><label className="block text-sm font-bold">اشتراک با کاربر<input required value={shareIdentifier} onChange={(event) => setShareIdentifier(event.target.value)} placeholder="ایمیل یا username" className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" /></label><div className="flex gap-3"><select value={sharePermission} onChange={(event) => setSharePermission(event.target.value as "VIEW" | "DOWNLOAD")} className="rounded-xl border border-slate-200 px-3 text-sm"><option value="DOWNLOAD">مشاهده و دانلود</option><option value="VIEW">فقط مشاهده</option></select><button disabled={shareBusy} className="flex-1 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">اشتراک‌گذاری</button></div></form><div className="my-6 border-t border-slate-100" /><p className="text-sm font-bold">ساخت لینک اشتراک‌گذاری</p><p className="mt-1 text-xs text-slate-500">لینک برای ۷ روز معتبر است و هر زمان قابل لغو خواهد بود.</p>{shareLink ? <div className="mt-3 space-y-3"><div className="flex gap-2"><input readOnly value={shareLink} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs" /><button onClick={() => void navigator.clipboard.writeText(shareLink)} className="rounded-xl bg-slate-100 px-3 text-xs font-bold">کپی</button></div><button onClick={async () => { const response = await fetch(`/api/links/${shareLinkId}`, { method: "DELETE" }); if (response.ok) { setShareLink(""); setShareLinkId(""); setMessage("لینک لغو شد."); } }} className="text-xs font-bold text-red-600">لغو این لینک</button></div> : <button onClick={() => void createPublicLink()} disabled={shareBusy} className="mt-3 rounded-xl border border-blue-200 px-4 py-3 text-sm font-bold text-blue-700 disabled:opacity-50">ساخت لینک دانلود</button>}</section></div>}
    </div>
  );
}
