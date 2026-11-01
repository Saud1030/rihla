import Link from "next/link";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { logout } from "../actions";
import { site } from "@/config/site";
import { getBrand } from "@/lib/brand";
import { AdminNav, NavList } from "@/components/admin/nav";

async function BrandName() {
  const brand = await getBrand();
  return <>{brand.name.ar}</>;
}

async function Nav() {
  const session = await getSession();
  return <AdminNav user={session ? { role: session.role, permissions: session.permissions } : null} />;
}

async function CurrentAdmin() {
  const session = await getSession();
  if (!session) return null;
  const [avatar] = await db.select({ updatedAt: s.assets.updatedAt }).from(s.assets).where(eq(s.assets.key, `avatar-${session.uid}`)).limit(1);
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/admin/account" className="flex items-center gap-2 text-muted max-w-48 hover:text-ink" title={session.email} data-testid="current-admin">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own API route
          <img src={`/api/admin/avatar/${session.uid}?v=${avatar.updatedAt.getTime()}`} alt="" className="size-8 rounded-full object-cover border border-line" />
        ) : (
          <span className="grid place-items-center size-8 rounded-full bg-sign-soft text-sign font-semibold" aria-hidden>
            {session.name.trim().charAt(0)}
          </span>
        )}
        <span className="truncate">{session.name}</span>
      </Link>
      <form action={logout}>
        <button type="submit" className="text-sign hover:underline">
          خروج
        </button>
      </form>
    </div>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      <aside className="bg-sign-deep text-white md:min-h-dvh">
        <div className="px-4 h-14 flex items-center justify-between md:justify-start gap-2 border-b border-white/10">
          <Link href="/admin" className="font-display font-medium truncate">
            <Suspense fallback={site.name.ar}>
              <BrandName />
            </Suspense>
          </Link>
        </div>
        <Suspense fallback={<NavList pathname="" user={null} />}>
          <Nav />
        </Suspense>
        <div className="hidden md:block px-4 py-4 border-t border-white/10 mt-4">
          <Link href="/ar" target="_blank" className="text-sm text-white/70 hover:text-white">
            عرض الموقع
          </Link>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="h-14 bg-paper border-b border-line px-4 md:px-8 flex items-center justify-end">
          <Suspense fallback={null}>
            <CurrentAdmin />
          </Suspense>
        </header>
        <main className="p-4 md:p-8 max-w-7xl">{children}</main>
      </div>
    </div>
  );
}
