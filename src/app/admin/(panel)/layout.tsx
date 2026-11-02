import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, LogOut } from "lucide-react";
import { getSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { logout } from "../actions";
import { site } from "@/config/site";
import { getBrand, heroImages } from "@/lib/brand";
import { AdminNav, NavList } from "@/components/admin/nav";
import { MenuToggle, ThemeToggle } from "@/components/admin/admin-view";
import { ADMIN_VIEW_SCRIPT } from "@/lib/admin-view-script";

async function BrandName() {
  const brand = await getBrand();
  return <>{brand.name.ar}</>;
}
async function BrandMark() {
  const brand = await getBrand();
  return <>{brand.name.ar.trim().charAt(0)}</>;
}

async function Nav() {
  const session = await getSession();
  return <AdminNav user={session ? { role: session.role, permissions: session.permissions } : null} />;
}

/** glass look: the site's first background photo (dimmed) behind the panels, or a warm dark gradient */
async function Backdrop() {
  const [img] = await heroImages();
  return <div className="admin-backdrop" aria-hidden style={img ? { backgroundImage: `url("${img.url}")` } : undefined} />;
}

async function CurrentAdmin() {
  const session = await getSession();
  if (!session) return null;
  const [avatar] = await db.select({ updatedAt: s.assets.updatedAt }).from(s.assets).where(eq(s.assets.key, `avatar-${session.uid}`)).limit(1);
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link href="/admin/account" className="admin-pill flex items-center gap-2 max-w-52 hover:text-ink" title={session.email} data-testid="current-admin">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- our own API route
          <img src={`/api/admin/avatar/${session.uid}?v=${avatar.updatedAt.getTime()}`} alt="" className="size-8 rounded-full object-cover border border-line" />
        ) : (
          <span className="grid place-items-center size-8 rounded-full bg-amber text-ink font-semibold" aria-hidden>
            {session.name.trim().charAt(0)}
          </span>
        )}
        <span className="truncate">{session.name}</span>
      </Link>
      <form action={logout}>
        <button type="submit" className="icon-btn" aria-label="خروج" title="خروج">
          <LogOut className="size-[18px]" aria-hidden />
        </button>
      </form>
    </div>
  );
}

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell min-h-dvh">
      <script dangerouslySetInnerHTML={{ __html: ADMIN_VIEW_SCRIPT }} />
      <Suspense fallback={<div className="admin-backdrop" aria-hidden />}>
        <Backdrop />
      </Suspense>
      <div className="relative md:grid md:grid-cols-[auto_minmax(0,1fr)] md:gap-4 md:p-4">
        <aside className="admin-side bg-sign-deep text-white md:sticky md:top-4 md:h-[calc(100dvh-2rem)] md:rounded-2xl flex flex-col">
          <div className="px-3 h-14 flex items-center gap-2.5 border-b border-white/10 shrink-0">
            <Link href="/admin" className="flex items-center gap-2.5 min-w-0 font-display font-medium" aria-label="الرئيسية">
              <span className="grid place-items-center size-9 shrink-0 rounded-xl bg-amber text-ink font-semibold">
                <Suspense fallback={site.name.ar.charAt(0)}>
                  <BrandMark />
                </Suspense>
              </span>
              <span className="nav-label truncate">
                <Suspense fallback={site.name.ar}>
                  <BrandName />
                </Suspense>
              </span>
            </Link>
          </div>
          <div className="md:flex-1 md:overflow-y-auto md:overflow-x-visible admin-side-scroll">
            <Suspense fallback={<NavList pathname="" user={null} />}>
              <Nav />
            </Suspense>
          </div>
          <div className="hidden md:flex flex-col gap-1 px-2 py-3 border-t border-white/10 shrink-0">
            <Link href="/ar" target="_blank" className="nav-link relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white" data-tip="عرض الموقع">
              <ExternalLink className="size-[18px] shrink-0" aria-hidden />
              <span className="nav-label">عرض الموقع</span>
            </Link>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="admin-top h-14 bg-paper border-b border-line px-4 md:px-5 flex items-center justify-between gap-3 md:rounded-2xl md:border">
            <MenuToggle />
            <div className="flex items-center gap-2 ms-auto">
              <ThemeToggle />
              <Suspense fallback={null}>
                <CurrentAdmin />
              </Suspense>
            </div>
          </header>
          <main className="admin-main p-4 md:px-1 md:py-6 max-w-7xl">{children}</main>
        </div>
      </div>
    </div>
  );
}
