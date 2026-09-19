import Link from "next/link";

const highlights = [
  { icon: "↗", title: "مدیریت متمرکز اسناد", description: "اسناد و فایل‌های کاری سازمان را در یک فضای منظم و قابل مدیریت نگهداری کنید." },
  { icon: "⌁", title: "همکاری درون‌سازمانی", description: "فایل‌ها را با اعضای مجاز سازمان به اشتراک بگذارید و سطح دسترسی هر کاربر را کنترل کنید." },
  { icon: "✦", title: "حفاظت از اطلاعات سازمان", description: "برای انتقال‌های حساس، فایل پیش از خروج از دستگاه کاربر رمزنگاری می‌شود." },
];

function FileIcon({ color }: { color: string }) {
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color} text-sm font-bold`}>▤</span>;
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfcfe] text-slate-900">
      <div className="absolute inset-x-0 top-0 -z-0 h-[520px] bg-[radial-gradient(circle_at_78%_10%,rgba(66,133,244,0.13),transparent_32%),radial-gradient(circle_at_14%_18%,rgba(52,168,83,0.08),transparent_28%)]" />
      <nav className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-3" aria-label="صفحه اصلی درایو سازمانی"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold text-white shadow-lg shadow-blue-600/20">D</span><span className="text-lg font-bold tracking-tight">درایو سازمانی</span></Link>
        <div className="flex items-center gap-3"><span className="hidden text-sm text-slate-500 sm:inline">سامانه مدیریت اسناد سازمان</span><Link href="/login" className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-blue-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50">ورود به سامانه</Link></div>
      </nav>

      <section className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[1fr_0.92fr] lg:px-10 lg:pb-28 lg:pt-20">
        <div className="max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-700"><span className="h-2 w-2 rounded-full bg-emerald-500" />سامانه رسمی مدیریت و تبادل اسناد</div>
          <h1 className="text-4xl font-bold leading-[1.45] tracking-tight sm:text-6xl sm:leading-[1.35]">مدیریت امن اسناد،<br /><span className="text-blue-600">در بستر سازمان.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-slate-600 sm:text-lg">درایو سازمانی، محیطی متمرکز برای نگهداری، مدیریت و تبادل فایل‌های کاری میان اعضای مجاز سازمان است؛ با کنترل دسترسی و توجه ویژه به محرمانگی اطلاعات.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center"><Link href="/login" className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-xl shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700">ورود به سامانه</Link><a href="#features" className="inline-flex items-center justify-center rounded-xl px-5 py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-100">آشنایی با قابلیت‌ها</a></div>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-500"><span className="flex items-center gap-2"><span className="text-emerald-500">✓</span>دسترسی مبتنی بر کاربر</span><span className="flex items-center gap-2"><span className="text-emerald-500">✓</span>ثبت و مدیریت اسناد</span><span className="flex items-center gap-2"><span className="text-emerald-500">✓</span>انتقال محرمانه اطلاعات</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-[560px]"><div className="absolute -inset-5 rounded-[2.5rem] bg-blue-100/60 blur-3xl" /><div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-slate-300/40">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400" /><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div><span className="text-xs font-bold text-slate-500">کارپوشه اسناد سازمان</span></div>
          <div className="grid grid-cols-[105px_1fr] gap-4 p-4 sm:grid-cols-[138px_1fr] sm:p-6"><aside className="space-y-2 border-l border-slate-100 pl-3 text-right sm:pl-5"><div className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700">همه فایل‌ها</div><div className="px-3 py-2 text-xs text-slate-400">اشتراکی</div><div className="px-3 py-2 text-xs text-slate-400">سطل زباله</div><div className="mt-7 rounded-xl border border-dashed border-slate-200 p-3 text-center text-[10px] text-slate-400">فضای استفاده‌شده<br /><span className="mt-1 block font-bold text-slate-600">۲.۴ از ۱۰ گیگابایت</span></div></aside><div className="min-w-0"><div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-bold">فایل‌های اخیر</p><p className="mt-1 text-[10px] text-slate-400">آخرین تغییرات شما</p></div><span className="rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-bold text-white">+ آپلود</span></div><div className="mb-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] text-slate-400">⌕ جست‌وجو در فایل‌ها</div><div className="space-y-2.5"><div className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5"><FileIcon color="bg-red-50 text-red-500" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">گزارش فصل اول.pdf</p><p className="mt-1 text-[9px] text-slate-400">امروز · ۲.۴ مگابایت</p></div><span className="text-[9px] text-emerald-500">آماده</span></div><div className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5"><FileIcon color="bg-blue-50 text-blue-500" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">برنامه پروژه.docx</p><p className="mt-1 text-[9px] text-slate-400">دیروز · ۸۶۰ کیلوبایت</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] text-indigo-600">اشتراکی</span></div><div className="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5"><FileIcon color="bg-emerald-50 text-emerald-500" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">داده‌های فروش.xlsx</p><p className="mt-1 text-[9px] text-slate-400">۲ روز پیش · ۱.۲ مگابایت</p></div><span className="text-[9px] text-slate-400">خصوصی</span></div></div></div></div>
        </div></div>
      </section>

      <section id="features" className="relative z-10 border-t border-slate-100 bg-white/70 px-5 py-16 sm:px-8 lg:px-10 lg:py-20"><div className="mx-auto max-w-7xl"><div className="mb-10 max-w-xl"><p className="text-sm font-bold text-blue-600">قابلیت‌های سامانه</p><h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">زیرساختی برای مدیریت رسمی اسناد</h2></div><div className="grid gap-5 md:grid-cols-3">{highlights.map((item) => <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-xl font-bold text-blue-600">{item.icon}</span><h3 className="mt-5 font-bold">{item.title}</h3><p className="mt-3 text-sm leading-7 text-slate-500">{item.description}</p></article>)}</div></div></section>
      <footer className="relative z-10 border-t border-slate-200 bg-white px-5 py-7 sm:px-8 lg:px-10"><div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span>درایو سازمانی · سامانه مدیریت اسناد</span><span>دسترسی به سامانه برای کاربران مجاز سازمان امکان‌پذیر است.</span></div></footer>
    </main>
  );
}
