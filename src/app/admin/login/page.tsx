import type { Metadata } from "next";
import { LoginForm } from "./login-form";
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
    <div className="min-h-dvh grid place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="sign px-6 py-5 mb-6">
          <p className="font-display text-xl font-semibold">
            <Suspense fallback={site.name.ar}>
              <BrandName />
            </Suspense>
          </p>
          <p className="text-white/80 text-sm">لوحة التحكم</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
