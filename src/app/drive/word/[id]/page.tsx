"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import { useEffect, useState } from "react";

type WordDocument = { name: string; html: string; revision: string; canEdit: boolean; isOwner: boolean; conversionWarnings: string[] };

function VersionHistory({ id }: { id: string }) {
  const [visible, setVisible] = useState(false);
  const [versions, setVersions] = useState<{ id: string; size: string; createdAt: string }[]>([]);
  const [error, setError] = useState("");
  async function toggle() {
    if (visible) { setVisible(false); return; }
    setError("");
    try {
      const response = await fetch(`/api/word/${id}/versions`, { cache: "no-store" });
      if (!response.ok) throw new Error("دریافت نسخه‌های قبلی انجام نشد.");
      const data = await response.json() as { versions: typeof versions };
      setVersions(data.versions); setVisible(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "دریافت نسخه‌های قبلی انجام نشد."); }
  }
  return <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
    <button type="button" onClick={() => void toggle()} className="font-bold text-blue-700">{visible ? "بستن نسخه‌های قبلی" : "نسخه‌های قبلی سند"}</button>
    {error && <p role="alert" className="mt-2 text-red-700">{error}</p>}
    {visible && (versions.length ? <ul className="mt-4 space-y-2">{versions.map((version) => <li key={version.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-2"><span>{new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.createdAt))} · {(Number(version.size) / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت</span><a href={`/api/word/${id}/versions/${version.id}`} className="font-bold text-blue-700">دریافت نسخه</a></li>)}</ul> : <p className="mt-3 text-slate-500">هنوز ویرایشی ذخیره نشده است.</p>)}
  </section>;
}

function WordContent({ document, id }: { document: WordDocument; id: string }) {
  const [revision, setRevision] = useState(document.revision);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const editor = useEditor({
    extensions: [StarterKit, TableKit, Image.configure({ allowBase64: true })],
    content: document.html,
    editable: document.canEdit,
    immediatelyRender: false,
    editorProps: { attributes: { class: "word-document min-h-[65vh] outline-none", dir: "auto" } },
    onUpdate: () => { setDirty(true); setMessage(""); },
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (!editor || !dirty || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/word/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "text/html; charset=utf-8", "If-Match": revision },
        body: editor.getHTML(),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error("این سند در جای دیگری تغییر کرده است. برای دریافت نسخهٔ جدید صفحه را دوباره باز کنید.");
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || "ذخیرهٔ سند انجام نشد.");
      }
      const result = await response.json() as { revision: string };
      setRevision(result.revision);
      setDirty(false);
      setMessage("نسخهٔ جدید سند ذخیره شد.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیرهٔ سند انجام نشد."); }
    finally { setSaving(false); }
  }

  const button = (label: string, active: boolean, action: () => void) => (
    <button type="button" aria-label={label} title={label} onClick={action} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${active ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-200"}`}>{label}</button>
  );

  return <>
    {document.canEdit && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" dir="rtl">
      {editor && <>
        {button("متن", editor.isActive("paragraph"), () => editor.chain().focus().setParagraph().run())}
        {button("تیتر ۱", editor.isActive("heading", { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run())}
        {button("تیتر ۲", editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        {button("پررنگ", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run())}
        {button("کج", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run())}
        {button("زیرخط", editor.isActive("underline"), () => editor.chain().focus().toggleUnderline().run())}
        {button("فهرست", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run())}
        {button("شماره‌گذاری", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run())}
        {button("جدول", editor.isActive("table"), () => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run())}
        {button("بازگردانی", false, () => editor.chain().focus().undo().run())}
        {button("تکرار", false, () => editor.chain().focus().redo().run())}
      </>}
      <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="mr-auto rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "در حال ذخیره..." : "ذخیرهٔ نسخهٔ جدید"}</button>
    </div>}
    {(error || message) && <p role={error ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{error || message}</p>}
    <article className="mx-auto min-h-[70vh] max-w-[850px] rounded-2xl border border-slate-200 bg-white px-6 py-9 shadow-lg shadow-slate-200/50 sm:px-12 sm:py-14" dir="auto">
      <EditorContent editor={editor} />
    </article>
  </>;
}

export default function WordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [document, setDocument] = useState<WordDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/word/${id}`, { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { router.replace("/login"); return; }
      const body = await response.json() as WordDocument & { error?: string };
      if (!response.ok) throw new Error(body.error || "بازکردن سند انجام نشد.");
      if (active) setDocument(body);
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "بازکردن سند انجام نشد."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, router]);

  return <main className="min-h-screen bg-[#f7f9fc] px-4 py-6 text-slate-900 sm:px-8" dir="rtl">
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div><Link href="/drive" className="text-sm font-bold text-blue-700">بازگشت به کارپوشه</Link><h1 className="mt-3 break-words text-2xl font-bold">{document?.name || "سند Word"}</h1></div>
        {document && <span className="rounded-full bg-blue-50 px-4 py-2 text-xs font-bold text-blue-700">{document.canEdit ? "قابل ویرایش" : "فقط مشاهده"}</span>}
      </header>
      {loading && <p role="status" className="rounded-xl bg-white p-6 text-sm text-slate-600">در حال بازکردن سند...</p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-6 text-sm text-red-700">{error}</p>}
      {document && <>
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">این ویرایشگر محتوای رایج Word را نمایش می‌دهد. صفحه‌آرایی، سربرگ‌ها و ویژگی‌های پیچیده ممکن است هنگام ذخیره ساده شوند. نسخهٔ قبلی فایل نگهداری می‌شود.</p>
        {document.conversionWarnings.length > 0 && <p className="mb-5 text-xs text-slate-500">برخی اجزای سند ممکن است دقیق نمایش داده نشوند ({document.conversionWarnings.length.toLocaleString("fa-IR")} مورد).</p>}
        {document.isOwner && <VersionHistory id={id} />}
        <WordContent key={`${id}:${document.revision}`} document={document} id={id} />
      </>}
    </div>
  </main>;
}
