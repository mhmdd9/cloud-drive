"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PublicFile = { file: { name: string; mimeType: string; size: string; status: string }; permission: "VIEW" | "DOWNLOAD"; expiresAt: string | null; owner: { name: string } };

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<PublicFile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!params.token) return; void fetch(`/api/public-links/${params.token}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error((await response.json()).error || "لینک معتبر نیست."); setData(await response.json()); }).catch((reason) => setError(reason instanceof Error ? reason.message : "لینک معتبر نیست.")); }, [params.token]);
  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f9fc] px-5"><div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(66,133,244,0.14),transparent_42%)]" /><section className="relative w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-2xl shadow-slate-200/60 sm:p-10"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20" aria-hidden="true"><svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.9"><path strokeLinecap="round" strokeLinejoin="round" d="M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.55A6.2 6.2 0 0 0 5.85 9.8 4.35 4.35 0 0 0 7 18.5Z" /></svg></div>{error ? <><h1 className="mt-5 text-xl font-bold">لینک در دسترس نیست</h1><p className="mt-3 text-sm leading-7 text-slate-500">{error}</p></> : !data ? <p className="mt-5 text-sm text-slate-500">در حال دریافت اطلاعات فایل...</p> : <><p className="mt-5 text-sm text-slate-500">فایل اشتراک‌گذاری‌شده توسط {data.owner.name}</p><h1 className="mt-2 break-words text-xl font-bold">{data.file.name}</h1><p className="mt-2 text-sm text-slate-500">{data.file.mimeType} · {(Number(data.file.size) / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت</p>{data.permission === "DOWNLOAD" ? <a href={`/api/public-links/${params.token}/download`} className="mt-7 inline-flex rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">دانلود فایل</a> : <p className="mt-7 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">این لینک فقط برای مشاهده است؛ پیش‌نمایش در نسخه‌ی بعد اضافه می‌شود.</p>}</>}</section></main>;
}
