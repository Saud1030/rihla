import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/auth";
import { getConversationAdmin, markConversationRead } from "@/lib/admin-data";
import { formatDateTime } from "@/lib/format";
import { closeChat, replyChat } from "../../../chat-actions";
import { ActionForm } from "@/components/admin/action-form";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { ChatReply } from "@/components/admin/chat-reply";
import { Card, Skeleton } from "@/components/admin/ui";
import { waLink } from "@/components/site/whatsapp-fab";

const STATUS_LABEL: Record<string, string> = { bot: "مع البوت", waiting: "بانتظار موظف", open: "مع موظف", closed: "مغلقة" };

export default function ConversationPage({ params }: PageProps<"/admin/chat/[id]">) {
  return (
    <>
      <Link href="/admin/chat" className="text-sm text-muted hover:text-ink">
        → كل المحادثات
      </Link>
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Conversation params={params} />
      </Suspense>
    </>
  );
}

async function Conversation({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("chat");
  const { id } = await params;
  const c = await getConversationAdmin(id);
  if (!c) notFound();
  if (c.unreadAdmin > 0) await markConversationRead(c.id);

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_300px] items-start">
      <AutoRefresh every={4000} />
      <Card className="flex flex-col">
        <div className="px-5 py-4 border-b border-line flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{c.customerName || "زائر"}</h1>
          <span className="text-xs rounded-full border border-line px-2 py-0.5">{STATUS_LABEL[c.status]}</span>
        </div>
        <ol className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto" data-testid="admin-chat-messages">
          {c.messages.map((m) => {
            if (m.sender === "system")
              return (
                <li key={m.id} className="text-center text-xs text-muted">
                  {m.body}
                </li>
              );
            const customer = m.sender === "customer";
            return (
              <li key={m.id} className={`flex ${customer ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] whitespace-pre-wrap break-words ${customer ? "bg-stone" : m.sender === "staff" ? "bg-sign text-white" : "bg-sign-soft"}`}>
                  <span className={`block text-xs mb-0.5 ${m.sender === "staff" ? "text-white/80" : "text-muted"}`}>
                    {customer ? "العميل" : m.sender === "staff" ? m.staffName || "الموظف" : "البوت"} · {formatDateTime(m.createdAt, "ar")}
                  </span>
                  {m.body}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="px-5 py-4 border-t border-line">
          <ChatReply id={c.id} action={replyChat} />
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5 space-y-2 text-sm">
          <h2 className="font-semibold mb-1">العميل</h2>
          <p>الاسم: {c.customerName || "—"}</p>
          <p>
            الجوال: <span dir="ltr">{c.customerPhone || "—"}</span>
          </p>
          <p>
            رقم الحجز:{" "}
            {c.bookingRef ? (
              <Link href={`/admin/bookings/${c.bookingRef}`} className="text-sign hover:underline" dir="ltr">
                {c.bookingRef}
              </Link>
            ) : (
              "—"
            )}
          </p>
          <p>اللغة: {c.locale === "en" ? "الإنجليزية" : "العربية"}</p>
          <p>بدأت: {formatDateTime(c.createdAt, "ar")}</p>
          {c.customerPhone && (
            <div className="flex gap-2 pt-2">
              <a href={waLink(c.customerPhone)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !min-h-9 !py-1 text-sm">
                واتساب
              </a>
              <a href={`tel:${c.customerPhone}`} className="btn btn-ghost !min-h-9 !py-1 text-sm">
                اتصال
              </a>
            </div>
          )}
        </Card>
        {c.status !== "closed" && (
          <Card className="p-5">
            <p className="text-sm text-muted mb-3">إنهاء المحادثة يعيد العميل للبوت إذا كتب من جديد.</p>
            <ActionForm action={closeChat} submitLabel="إنهاء المحادثة" submitClassName="btn btn-ghost">
              <input type="hidden" name="id" value={c.id} />
            </ActionForm>
          </Card>
        )}
      </div>
    </div>
  );
}
