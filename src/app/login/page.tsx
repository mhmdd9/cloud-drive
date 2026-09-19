"use client";

import Link from "next/link";
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
    setLoading(true); setError(""); setStatus("در حال ورود به سامانه...");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: data.get("identifier"), password: data.get("password") }) });
      if (!response.ok) {
        setStatus("");
        setError(response.status === 429 ? "تعداد تلاش‌ها بیش از حد مجاز است. پانزده دقیقه دیگر دوباره تلاش کنید." : response.status === 400 || response.status === 401 ? "نام کاربری، ایمیل یا رمز عبور نادرست است." : "ورود انجام نشد. لطفاً دوباره تلاش کنید.");
        return;
      }
      setStatus("ورود موفق بود. در حال انتقال به کارپوشه..."); router.replace("/drive"); router.refresh();
    } catch { setStatus(""); setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید."); } finally { submitting.current = false; setLoading(false); }
  }

  return <main dir="rtl" lang="fa" className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f9fc] px-5 py-10 text-slate-900 sm:px-8"><div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_20%_15%,rgba(66,133,244,0.14),transparent_34%),radial-gradient(circle_at_85%_10%,rgba(52,168,83,0.08),transparent_28%)]" /><div className="relative grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-200/70 lg:grid-cols-[0.9fr_1.1fr]">
    <section className="hidden bg-gradient-to-br from-blue-700 to-blue-600 p-10 text-white lg:flex lg:flex-col lg:justify-between"><div><Link href="/" className="flex items-center gap-3 text-lg font-bold"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 text-xl">D</span>درایو سازمانی</Link><div className="mt-24"><p className="text-sm text-blue-100">سامانه مدیریت اسناد سازمان</p><h1 className="mt-4 text-4xl font-bold leading-[1.5]">به کارپوشه<br />سازمانی خود وارد شوید.</h1><p className="mt-5 max-w-sm text-sm leading-8 text-blue-100">دسترسی متمرکز به فایل‌ها، اسناد و اشتراک‌گذاری‌های سازمانی برای کاربران مجاز.</p></div></div><div className="flex gap-5 text-xs text-blue-100"><span>✓ کنترل دسترسی</span><span>✓ انتقال محرمانه</span></div></section>
    <section className="p-7 sm:p-10 lg:p-14"><Link href="/" className="flex items-center gap-3 text-lg font-bold lg:hidden"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white">D</span>درایو سازمانی</Link><div className="mx-auto max-w-md lg:mt-10"><p className="text-sm font-bold text-blue-600">احراز هویت سازمانی</p><h2 className="mt-3 text-3xl font-bold tracking-tight">ورود به سامانه</h2><p className="mt-3 text-sm leading-7 text-slate-500">برای ورود، از حساب کاربری ایجادشده توسط مدیر سامانه استفاده کنید.</p><form onSubmit={submit} aria-busy={loading} className="mt-9 space-y-5"><div><label htmlFor="identifier" className="text-sm font-bold">نام کاربری یا ایمیل</label><input id="identifier" name="identifier" type="text" dir="ltr" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} disabled={loading} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50" /></div><div><label htmlFor="password" className="text-sm font-bold">رمز عبور</label><input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required maxLength={1024} disabled={loading} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50" /></div>{error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm leading-6 text-red-700">{error}</p>}<p role="status" aria-live="polite" className="min-h-6 text-sm text-slate-500">{status}</p><button type="submit" disabled={loading} className="w-full rounded-xl bg-blue-600 p-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-50">{loading ? "در حال ورود..." : "ورود به سامانه"}</button></form><p className="mt-8 text-center text-xs leading-6 text-slate-400">دسترسی به این سامانه صرفاً برای کاربران مجاز سازمان امکان‌پذیر است.</p></div></section>
  </div></main>;
}
