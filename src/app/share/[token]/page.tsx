"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type PublicFile = { file: { name: string; mimeType: string; size: string; status: string }; permission: "VIEW" | "DOWNLOAD"; expiresAt: string | null; owner: { name: string } };

export default function PublicSharePage() {
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<PublicFile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (!params.token) return; void fetch(`/api/public-links/${params.token}`, { cache: "no-store" }).then(async (response) => { if (!response.ok) throw new Error((await response.json()).error || "لینک معتبر نیست."); setData(await response.json()); }).catch((reason) => setError(reason instanceof Error ? reason.message : "لینک معتبر نیست.")); }, [params.token]);
  return <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-100 text-2xl text-blue-700">ک</div>{error ? <><h1 className="mt-5 text-xl font-bold">لینک در دسترس نیست</h1><p className="mt-3 text-sm text-slate-500">{error}</p></> : !data ? <p className="mt-5 text-sm text-slate-500">در حال دریافت اطلاعات فایل...</p> : <><p className="mt-5 text-sm text-slate-500">فایل اشتراک‌گذاری‌شده توسط {data.owner.name}</p><h1 className="mt-2 break-words text-xl font-bold">{data.file.name}</h1><p className="mt-2 text-sm text-slate-500">{data.file.mimeType} · {(Number(data.file.size) / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت</p>{data.permission === "DOWNLOAD" ? <a href={`/api/public-links/${params.token}/download`} className="mt-7 inline-flex rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white">دانلود فایل</a> : <p className="mt-7 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">این لینک فقط برای مشاهده است؛ پیش‌نمایش در نسخه‌ی بعد اضافه می‌شود.</p>}</>}</section></main>;
}
