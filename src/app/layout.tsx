import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vazirmatn = localFont({
  src: [
    { path: "./fonts/Vazirmatn-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Vazirmatn-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const metadata: Metadata = {
  title: "درایو سازمانی",
  description: "فضای مدیریت و اشتراک‌گذاری اسناد سازمان",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
