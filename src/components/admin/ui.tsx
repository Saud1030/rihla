import Link from "next/link";

export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {action}
    </div>
  );
}

export function Card({ children, className = "", ...rest }: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`bg-paper border border-line rounded-xl ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export function Skeleton({ h = "h-64" }: { h?: string }) {
  return <div className={`${h} rounded-xl bg-paper border border-line animate-pulse`} />;
}

export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav className="flex items-center gap-2 mt-4 text-sm" aria-label="الصفحات">
      {page > 1 && (
        <Link href={href(page - 1)} className="btn btn-ghost !min-h-9 !py-1">
          السابق
        </Link>
      )}
      <span className="text-muted tabular">
        صفحة {page} من {pages}
      </span>
      {page < pages && (
        <Link href={href(page + 1)} className="btn btn-ghost !min-h-9 !py-1">
          التالي
        </Link>
      )}
    </nav>
  );
}
