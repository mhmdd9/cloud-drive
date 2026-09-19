"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decryptConfidentialFile } from "@/lib/client-crypto";

type Share = { id: string; permission: "VIEW" | "DOWNLOAD" | "EDIT"; recipient?: { name: string; email: string; username: string | null } | null; file: { name: string; size: string; owner: { name: string } } };

function formatBytes(value: number) {
  if (value < 1024) return `${value} بایت`;
  const units = ["کیلوبایت", "مگابایت", "گیگابایت"];
  let size = value; let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} ${units[unit]}`;
}

export default function SharedFilesPage() {
  const router = useRouter();
  const [shares, setShares] = useState<Share[]>([]);
  const [view, setView] = useState<"incoming" | "outgoing">("incoming");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    void fetch(`/api/shares?view=${view}`, { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) return router.replace("/login");
      if (!response.ok) throw new Error("دریافت فایل‌های اشتراکی انجام نشد.");
      setShares((await response.json()).shares);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "خطا در دریافت فایل‌ها.")).finally(() => setLoading(false));
  }, [router, view]);

  async function revoke(id: string) {
    const response = await fetch(`/api/shares/${id}`, { method: "DELETE" });
    if (response.ok) setShares((current) => current.filter((share) => share.id !== id));
  }

  async function downloadSharedFile(id: string) {
    try {
      const response = await fetch(`/api/shares/${id}/download`);
      if (!response.ok) throw new Error("دانلود فایل انجام نشد.");
      if (!(response.headers.get("content-type") || "").includes("application/json")) { window.location.href = `/api/shares/${id}/download`; return; }
      const data = await response.json() as { url: string; encryptedFileKey: string; iv: string; mimeType: string; name: string };
      const encrypted = await (await fetch(data.url)).arrayBuffer();
      const plain = await decryptConfidentialFile(encrypted, data.encryptedFileKey, data.iv);
      const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([plain], { type: data.mimeType })); anchor.download = data.name; anchor.click(); URL.revokeObjectURL(anchor.href);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "دانلود فایل انجام نشد."); }
  }

  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-6 text-slate-900 sm:px-8 lg:px-10"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between border-b border-slate-200 pb-5"><div><Link href="/drive" className="text-sm font-bold text-blue-700">بازگشت به کارپوشه</Link><h1 className="mt-5 text-2xl font-bold">اشتراک‌گذاری اسناد</h1><p className="mt-1 text-sm text-slate-500">مدیریت فایل‌هایی که با شما یا توسط شما به اشتراک گذاشته شده‌اند</p></div><Link href="/drive" className="hidden h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg shadow-blue-600/20 sm:flex">D</Link></header>
    <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><div className="flex gap-2"><button onClick={() => setView("incoming")} className={`rounded-xl px-5 py-3 text-sm font-bold transition ${view === "incoming" ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-slate-500 hover:bg-slate-50"}`}>اشتراکی با من</button><button onClick={() => setView("outgoing")} className={`rounded-xl px-5 py-3 text-sm font-bold transition ${view === "outgoing" ? "bg-blue-600 text-white shadow-md shadow-blue-600/20" : "text-slate-500 hover:bg-slate-50"}`}>اشتراک‌گذاری‌های من</button></div></section>
    {(error) && <p role="alert" className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{loading ? <p className="p-12 text-center text-sm text-slate-500">در حال دریافت اسناد اشتراکی...</p> : shares.length === 0 ? <div className="p-14 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-2xl text-blue-600">⌁</div><p className="mt-4 font-bold">{view === "incoming" ? "هنوز سندی با شما به اشتراک گذاشته نشده است." : "هنوز سندی را با کاربری به اشتراک نگذاشته‌اید."}</p><p className="mt-2 text-sm text-slate-500">فایل‌های اشتراک‌گذاری‌شده در این بخش نمایش داده می‌شوند.</p></div> : <div className="divide-y divide-slate-100">{shares.map((share) => <div key={share.id} className="flex flex-col gap-4 p-5 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl text-blue-600">▤</span><div className="min-w-0"><p className="truncate font-bold">{share.file.name}</p><p className="mt-1 text-xs text-slate-500">{view === "incoming" ? `از طرف ${share.file.owner.name}` : `با ${share.recipient?.name || share.recipient?.email || "کاربر"}`} · {formatBytes(Number(share.file.size))}</p></div></div><div className="flex items-center gap-4 pr-14 sm:pr-0"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{share.permission === "VIEW" ? "مشاهده" : share.permission === "EDIT" ? "ویرایش" : "دانلود"}</span>{view === "incoming" ? (share.permission === "VIEW" ? <span className="text-xs text-slate-400">پیش‌نمایش به‌زودی</span> : <button onClick={() => void downloadSharedFile(share.id)} className="text-sm font-bold text-blue-700 hover:text-blue-900">دانلود</button>) : <button onClick={() => void revoke(share.id)} className="text-sm font-bold text-red-600">لغو دسترسی</button>}</div></div>)}</div>}</section>
  </div></main>;
}
