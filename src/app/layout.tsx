import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "درایو سازمانی",
  description: "فضای مدیریت و اشتراک‌گذاری اسناد سازمان",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
