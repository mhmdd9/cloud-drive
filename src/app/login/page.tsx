"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const submitting = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setLoading(true);
    setError("");
    setStatus("در حال ورود...");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: data.get("identifier"), password: data.get("password") }),
      });
      if (!response.ok) {
        setStatus("");
        setError(response.status === 429
          ? "تعداد تلاش‌ها بیش از حد مجاز است. پانزده دقیقه دیگر دوباره تلاش کنید."
          : response.status === 400 || response.status === 401
            ? "نام کاربری، ایمیل یا رمز عبور نادرست است."
            : "ورود انجام نشد. لطفاً دوباره تلاش کنید.");
        return;
      }
      setStatus("ورود موفق بود. در حال انتقال...");
      router.replace("/");
      router.refresh();
    } catch {
      setStatus("");
      setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" lang="fa" className="flex flex-1 items-center justify-center bg-zinc-50 p-6 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <form onSubmit={submit} aria-busy={loading} className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-zinc-300 p-8 dark:border-zinc-700">
        <h1 className="text-2xl font-semibold">ورود به فضای ابری</h1>
        <p className="text-sm">برای ورود از حساب ایجادشده توسط مدیر استفاده کنید.</p>
        <label htmlFor="identifier">نام کاربری یا ایمیل</label>
        <input id="identifier" name="identifier" type="text" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={loading} className="rounded border p-3" />
        <label htmlFor="password">رمز عبور</label>
        <input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required maxLength={1024} disabled={loading} className="rounded border p-3" />
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <p role="status" aria-live="polite" className="text-sm">{status}</p>
        <button type="submit" disabled={loading} className="rounded bg-zinc-950 p-3 text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-black">
          {loading ? "در حال ورود..." : "ورود"}
        </button>
      </form>
    </main>
  );
}
