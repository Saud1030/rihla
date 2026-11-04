import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { LoginScene } from "./login-scene";
import { Suspense } from "react";
import { site } from "@/config/site";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = { title: "تسجيل الدخول" };

async function BrandName() {
  const brand = await getBrand();
  return <>{brand.name.ar}</>;
}

export default function LoginPage() {
  return (
    <div className="login-page min-h-dvh grid place-items-center px-4 py-10">
      <LoginScene />
      <div className="relative z-10 w-full max-w-sm">
        <LoginForm
          brand={
            <Suspense fallback={site.name.ar}>
              <BrandName />
            </Suspense>
          }
        />
        <p className="mt-5 text-center text-sm text-white/80">
          سائق جديد؟{" "}
          <Link href="/ar/drivers/join" className="font-medium text-amber-200 underline underline-offset-4 hover:text-white">
            سجّل طلب انضمام
          </Link>
        </p>
      </div>
    </div>
  );
}
