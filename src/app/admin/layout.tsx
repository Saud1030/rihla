import type { Metadata } from "next";
import "../globals.css";
import { getBrand } from "@/lib/brand";
import { favicons } from "@/lib/favicons";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
    robots: { index: false, follow: false },
    icons: favicons(brand.logoUrl),
  };
}

export default function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-dvh bg-stone">{children}</body>
    </html>
  );
}
