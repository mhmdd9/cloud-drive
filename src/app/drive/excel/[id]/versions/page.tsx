"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Version = { id: string; size: string; createdAt: string };
export default function ExcelVersionsPage() {
  const { id } = useParams<{ id: string }>();
  const [versions, setVersions] = useState<Version[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void fetch(`/api/excel/${id}/versions`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as { versions?: Version[]; error?: string };
      if (!response.ok) throw new Error(body.error || "دریافت نسخه‌ها ناموفق بود.");
      setVersions(body.versions ?? []);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "دریافت نسخه‌ها ناموفق بود."));
  }, [id]);
  return <main className="mx-auto max-w-3xl p-6" dir="rtl"><Link href={`/drive/excel/${id}`} className="text-blue-700">بازگشت به اکسل</Link><h1 className="my-5 text-xl font-bold">نسخه‌های پیشین</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!error && !versions.length && <p>هنوز نسخهٔ قبلی ثبت نشده است.</p>}
    <ul className="space-y-3">{versions.map((version) => <li key={version.id} className="flex flex-wrap justify-between gap-3 rounded-xl border bg-white p-4"><span>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.createdAt))} · {(Number(version.size) / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت</span><a href={`/api/excel/${id}/versions/${version.id}`} className="font-bold text-blue-700">دانلود نسخه</a></li>)}</ul>
  </main>;
}
