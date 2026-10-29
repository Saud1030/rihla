"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import type { ActionState } from "@/app/admin/actions";

export type DestinationRow = {
  id: number;
  nameAr: string;
  nameEn: string;
  kind: string;
  city: string;
  active: boolean;
  noCoords: boolean;
};

/** Destinations list with per-row hide/show/delete and bulk actions on selected rows. */
export function DestinationsTable({ rows, action }: { rows: DestinationRow[]; action: (s: ActionState, f: FormData) => Promise<ActionState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<"bulk" | number | null>(null);

  // after a successful action, clear the selection (rows may have changed)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setSelected(new Set());
      setConfirm(null);
    }
  }

  const all = rows.length > 0 && selected.size === rows.length;
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const run = (op: string) => {
    const data = new FormData();
    data.set("op", op);
    if (!op.includes(":")) for (const id of selected) data.append("ids", String(id));
    startTransition(() => formAction(data));
  };

  return (
    <div>
      {/* bulk bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-stone/95 py-2 mb-2" aria-live="polite">
        <span className="text-sm text-muted tabular">{selected.size ? `${selected.size.toLocaleString("ar-SA")} محددة` : "حدّد وجهات لتطبيق عملية عليها"}</span>
        <button type="button" disabled={!selected.size || pending} onClick={() => run("hide")} className="btn btn-ghost !min-h-9 !py-1 text-sm">
          إخفاء المحدد
        </button>
        <button type="button" disabled={!selected.size || pending} onClick={() => run("show")} className="btn btn-ghost !min-h-9 !py-1 text-sm">
          إظهار المحدد
        </button>
        {confirm === "bulk" ? (
          <>
            <button type="button" disabled={pending} onClick={() => run("delete")} className="btn !min-h-9 !py-1 text-sm !bg-danger !text-white">
              تأكيد حذف {selected.size.toLocaleString("ar-SA")} وجهة
            </button>
            <button type="button" onClick={() => setConfirm(null)} className="text-sm text-muted hover:text-ink px-2">
              تراجع
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={!selected.size || pending}
            onClick={() => setConfirm("bulk")}
            className="btn btn-ghost !min-h-9 !py-1 text-sm !text-danger"
          >
            حذف المحدد
          </button>
        )}
        {state.error && <span className="text-sm text-danger">{state.error}</span>}
        {state.ok && state.message && <span className="text-sm text-sign">{state.message}</span>}
      </div>

      <div className="bg-paper border border-line rounded-xl overflow-x-auto">
        {rows.length ? (
          <table className="w-full text-sm">
            <thead className="text-muted">
              <tr className="border-b border-line">
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    aria-label="تحديد الكل"
                    checked={all}
                    onChange={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="size-4 accent-sign"
                  />
                </th>
                <th className="text-start font-medium px-4 py-3">الوجهة</th>
                <th className="text-start font-medium px-4 py-3">النوع</th>
                <th className="text-start font-medium px-4 py-3">المدينة</th>
                <th className="text-start font-medium px-4 py-3">الحالة</th>
                <th className="text-start font-medium px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} className={`hover:bg-stone/60 ${selected.has(r.id) ? "bg-sign-soft/60" : ""} ${r.active ? "" : "text-muted"}`}>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`تحديد ${r.nameAr}`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="size-4 accent-sign"
                    />
                  </td>
                  <td className="px-4 py-2.5 min-w-56">
                    <Link href={`/admin/destinations/${r.id}`} className="font-medium text-sign hover:underline">
                      {r.nameAr}
                    </Link>
                    <span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "right" }}>
                      {r.nameEn}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{r.kind}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    مدينة {r.city}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.active ? <span className="text-sign">ظاهرة</span> : <span className="text-danger">مخفية</span>}
                    {r.noCoords && <span className="block text-xs text-amber-deep">بدون إحداثيات</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(`${r.active ? "hide" : "show"}:${r.id}`)}
                        className="rounded-md border border-line px-2.5 py-1 text-xs hover:border-sign"
                      >
                        {r.active ? "إخفاء" : "إظهار"}
                      </button>
                      {confirm === r.id ? (
                        <>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(`delete:${r.id}`)}
                            className="rounded-md bg-danger text-white px-2.5 py-1 text-xs"
                          >
                            تأكيد الحذف
                          </button>
                          <button type="button" onClick={() => setConfirm(null)} className="px-1.5 py-1 text-xs text-muted hover:text-ink">
                            تراجع
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConfirm(r.id)}
                          className="rounded-md border border-line px-2.5 py-1 text-xs text-danger hover:border-danger"
                        >
                          حذف
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-8 text-center text-muted">لا توجد وجهات بهذه التصفية.</p>
        )}
      </div>
    </div>
  );
}
