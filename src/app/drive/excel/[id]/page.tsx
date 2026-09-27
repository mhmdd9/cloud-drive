"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { useParams, useRouter } from "next/navigation";

type EditorConfig = Record<string, unknown>;
type Workbook = { name: string; canEdit: boolean; isOwner: boolean; publicUrl: string; editor: EditorConfig };
type DocsAPI = { DocEditor: new (element: string, config: EditorConfig) => { destroyEditor: () => void } };

function Spreadsheet({ workbook }: { workbook: Workbook }) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!ready || !window.DocsAPI) return;
    const instance = new window.DocsAPI.DocEditor("excel-editor", {
      ...workbook.editor,
      events: {
        onAppReady: () => {
          window.dispatchEvent(new Event("resize"));
          window.setTimeout(() => window.dispatchEvent(new Event("resize")), 250);
        },
        onError: () => setMessage("ویرایشگر اکسل با خطا روبه‌رو شد. اتصال سرویس ONLYOFFICE و دسترسی آن به برنامه را بررسی کنید."),
      },
    });
    return () => instance.destroyEditor();
  }, [ready, workbook]);
  return <>
    <Script src={`${workbook.publicUrl}/web-apps/apps/api/documents/api.js`} onReady={() => setReady(true)} onError={() => setMessage("بارگذاری سرویس ویرایش اکسل انجام نشد.")} />
    {message && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}
    <div id="excel-editor" className="excel-editor-host" style={{ width: "100%", height: "800px" }} dir="ltr" />
  </>;
}

declare global { interface Window { DocsAPI?: DocsAPI } }

export default function ExcelPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void fetch(`/api/excel/${id}`, { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { router.replace("/login"); return; }
      const result = await response.json() as Workbook & { error?: string };
      if (!response.ok) throw new Error(result.error || "بازکردن فایل اکسل انجام نشد.");
      if (active) setWorkbook(result);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "بازکردن فایل اکسل انجام نشد."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, router]);
  return <main className="min-h-screen bg-[#f7f9fc] p-4 text-slate-900 sm:p-5" dir="rtl">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><Link href="/drive" className="text-sm font-bold text-blue-700">بازگشت به کارپوشه</Link><h1 className="mt-2 break-words text-xl font-bold">{workbook?.name ?? "فایل Excel"}</h1></div>
      {workbook && <span className="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">{workbook.canEdit ? "قابل ویرایش" : "فقط مشاهده"}</span>}
    </header>
    {loading && <p role="status" className="rounded-xl bg-white p-6">در حال آماده‌سازی اکسل...</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-6 text-red-700">{error}</p>}
    {workbook && <>
      <p className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">تغییرات پس از بسته‌شدن ویرایشگر و دریافت پیام ذخیره از سرویس، به‌عنوان نسخهٔ جدید ثبت می‌شوند. تا پایان ذخیره، این فایل را در جای دیگری ویرایش نکنید.</p>
      {workbook.isOwner && <p className="mb-4 text-sm"><Link href={`/drive/excel/${id}/versions`} className="font-bold text-blue-700">نسخه‌های قبلی فایل</Link></p>}
      <Spreadsheet workbook={workbook} />
    </>}
  </main>;
}
