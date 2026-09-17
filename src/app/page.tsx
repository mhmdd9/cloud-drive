import Link from "next/link";

const modules = [
  { title: "هویت و دسترسی", description: "ورود سازمانی، نشست قابل لغو و زیرساخت نقش‌های قابل تعریف." },
  { title: "ذخیره‌سازی اسناد", description: "زیرساخت آپلود مستقیم با کنترل اندازه، صحت فایل و الزام رمزنگاری KMS." },
  { title: "پردازش مستقل", description: "صف پردازش و ورکر جدا از وب، برای توسعه و افزایش ظرفیت در مراحل بعد." },
];

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-12">
      <header className="flex items-center justify-between border-b border-slate-200 pb-6">
        <span className="text-lg font-bold">درایو سازمانی</span>
        <span className="rounded-full bg-blue-50 px-4 py-2 text-xs text-blue-700">نسخهٔ زیرساخت</span>
      </header>
      <main className="flex flex-1 flex-col justify-center py-16">
        <p className="mb-5 text-sm font-medium text-blue-700">آغاز یک فضای مشترک برای اسناد سازمان</p>
        <h1 className="max-w-3xl text-3xl font-bold leading-relaxed sm:text-5xl sm:leading-relaxed">فایل‌های سازمان،<br />در یک فضای یکپارچه.</h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600">این مرحله، پایهٔ فنی محصول است؛ رابط مدیریت فایل، اشتراک‌گذاری و ویرایش آنلاین اسناد در مراحل بعد تکمیل می‌شوند.</p>
        <div className="mt-8">
          <Link href="/login" className="inline-flex rounded-xl bg-blue-700 px-7 py-3 text-sm font-medium text-white transition hover:bg-blue-800">ورود به حساب سازمانی</Link>
        </div>
        <section aria-label="بخش‌های زیرساخت" className="mt-16 grid gap-5 md:grid-cols-3">
          {modules.map((module) => (
            <article key={module.title} className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="font-bold">{module.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">{module.description}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="border-t border-slate-200 pt-6 text-xs leading-6 text-slate-500">برای ورود، سرویس‌های پایگاه داده و نشست باید راه‌اندازی شده و حساب اولیه توسط مدیر ایجاد شده باشد.</footer>
    </div>
  );
}
