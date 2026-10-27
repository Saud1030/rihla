import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-dvh bg-stone">{children}</body>
    </html>
  );
}
