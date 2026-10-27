import Link from "next/link";
import { Suspense } from "react";
import { requireSection } from "@/lib/auth";
import { chatCounts, listConversations, type ChatFilter } from "@/lib/admin-data";
import { formatDateTime, formatNumber } from "@/lib/format";
import { Card, PageHeader, Skeleton } from "@/components/admin/ui";
import { AutoRefresh } from "@/components/admin/auto-refresh";

const STATUS_LABEL: Record<string, string> = { bot: "مع البوت", waiting: "بانتظار موظف", open: "مع موظف", closed: "مغلقة" };
const FROM_LABEL: Record<string, string> = { customer: "العميل", bot: "البوت", staff: "الموظف", system: "النظام" };

export default function ChatInboxPage({ searchParams }: PageProps<"/admin/chat">) {
  return (
    <>
      <PageHeader
        title="المحادثات"
        action={
          <Link href="/admin/chat/settings" className="btn btn-ghost">
            إعدادات البوت والأسئلة
          </Link>
        }
      />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Inbox({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSection("chat");
  const sp = await searchParams;
  const filter: ChatFilter = sp.show === "all" ? "all" : sp.show === "staff" ? "staff" : "needs_reply";
  const [rows, counts] = await Promise.all([listConversations(filter), chatCounts()]);
  const tabs: [ChatFilter, string, number | null][] = [
    ["needs_reply", "تحتاج رد", counts.needsReply],
    ["staff", "مع موظف", counts.withStaff],
    ["all", "كل المحادثات", null],
  ];
  return (
    <div className="space-y-4">
      <AutoRefresh every={8000} />
      <nav className="flex flex-wrap gap-1.5" aria-label="تصفية المحادثات">
        {tabs.map(([key, label, n]) => (
          <Link
            key={key}
            href={key === "needs_reply" ? "/admin/chat" : `/admin/chat?show=${key}`}
            aria-current={filter === key ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm border ${filter === key ? "bg-ink text-white border-ink" : "bg-paper border-line"}`}
          >
            {label}
            {n != null && <span className="ms-1 tabular">({formatNumber(n, "ar")})</span>}
          </Link>
        ))}
      </nav>
      <Card>
        {rows.length ? (
          <ul className="divide-y divide-line">
            {rows.map(({ c, lastBody, lastFrom }) => {
              const needs = c.unreadAdmin > 0 && (c.status === "waiting" || c.status === "open");
              return (
                <li key={c.id}>
                  <Link href={`/admin/chat/${c.id}`} className={`flex items-start gap-4 px-5 py-4 hover:bg-stone/60 ${needs ? "bg-amber/10" : ""}`}>
                    <span className={`mt-1.5 size-2.5 rounded-full shrink-0 ${needs ? "bg-amber" : "bg-transparent"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{c.customerName || "زائر"}</span>
                        {c.customerPhone && (
                          <span className="text-sm text-muted" dir="ltr">
                            {c.customerPhone}
                          </span>
                        )}
                        <span className="text-xs rounded-full border border-line px-2 py-0.5">{STATUS_LABEL[c.status]}</span>
                        {needs && <span className="text-xs rounded-full bg-amber text-ink px-2 py-0.5 tabular">{formatNumber(c.unreadAdmin, "ar")} جديدة</span>}
                      </span>
                      <span className="block text-sm text-muted truncate mt-1">
                        {FROM_LABEL[lastFrom] ?? ""}: {lastBody}
                      </span>
                    </span>
                    <span className="text-xs text-muted whitespace-nowrap">{formatDateTime(c.lastMessageAt, "ar")}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="p-8 text-center text-muted">{filter === "needs_reply" ? "لا توجد محادثات تنتظر ردك." : "لا توجد محادثات."}</p>
        )}
      </Card>
      <p className="text-sm text-muted">تتحدث الصفحة تلقائيًا كل بضع ثوانٍ.</p>
    </div>
  );
}
