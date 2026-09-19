"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decryptConfidentialFile } from "@/lib/client-crypto";

type Share = { id: string; permission: "VIEW" | "DOWNLOAD" | "EDIT"; recipient?: { name: string; email: string; username: string | null } | null; file: { name: string; size: string; owner: { name: string } } };

function formatBytes(value: number) {
  if (value < 1024) return `${value} بایت`;
  const units = ["کیلوبایت", "مگابایت", "گیگابایت"];
  let size = value;
  let unit = -1;
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
    setLoading(true);
    setError("");
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
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        window.location.href = `/api/shares/${id}/download`;
        return;
      }
      const data = await response.json() as { url: string; encryptedFileKey: string; iv: string; mimeType: string; name: string };
      const encrypted = await (await fetch(data.url)).arrayBuffer();
      const plain = await decryptConfidentialFile(encrypted, data.encryptedFileKey, data.iv);
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(new Blob([plain], { type: data.mimeType }));
      anchor.download = data.name;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "دانلود فایل انجام نشد.");
    }
  }

  return <main className="min-h-screen bg-[#f7f9fc] px-5 py-6 text-slate-900 sm:px-8 lg:px-12"><div className="mx-auto max-w-5xl">
    <header className="border-b border-slate-200 pb-5"><Link href="/drive" className="text-sm text-blue-700">← بازگشت به فایل‌های من</Link><h1 className="mt-4 text-2xl font-bold">فایل‌های اشتراکی</h1><p className="mt-1 text-sm text-slate-500">فایل‌هایی که با شما یا توسط شما به اشتراک گذاشته شده‌اند</p><div className="mt-5 flex gap-2"><button onClick={() => setView("incoming")} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === "incoming" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>اشتراکی با من</button><button onClick={() => setView("outgoing")} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === "outgoing" ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>اشتراک‌گذاری‌های من</button></div></header>
    <section className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white">{loading ? <p className="p-10 text-center text-sm text-slate-500">در حال دریافت...</p> : error ? <p className="p-10 text-center text-sm text-red-600">{error}</p> : shares.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{view === "incoming" ? "هنوز فایلی با شما به اشتراک گذاشته نشده است." : "هنوز فایلی را با کاربری به اشتراک نگذاشته‌اید."}</p> : <div className="divide-y divide-slate-100">{shares.map((share) => <div key={share.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">{share.file.name}</p><p className="mt-1 text-xs text-slate-500">{view === "incoming" ? `از طرف ${share.file.owner.name}` : `با ${share.recipient?.name || share.recipient?.email || "کاربر"}`} · {formatBytes(Number(share.file.size))}</p></div><div className="flex items-center gap-4"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{share.permission === "VIEW" ? "مشاهده" : share.permission === "EDIT" ? "ویرایش" : "دانلود"}</span>{view === "incoming" ? (share.permission === "VIEW" ? <span className="text-xs text-slate-400">پیش‌نمایش به‌زودی</span> : <button onClick={() => void downloadSharedFile(share.id)} className="text-sm font-bold text-blue-700">دانلود</button>) : <button onClick={() => void revoke(share.id)} className="text-sm font-bold text-red-600">لغو دسترسی</button>}</div></div>)}</div>}</section>
  </div></main>;
}
