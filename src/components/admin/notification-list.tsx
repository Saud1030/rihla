import Link from "next/link";
import type { Notification } from "@/db/schema";
import { KIND_LABELS, type NotifyKind } from "@/lib/notify";
import { bookingNo, formatDateTime } from "@/lib/format";
import { markNotificationManual, retryNotification } from "@/app/admin/notify-actions";
import { ActionForm } from "./action-form";
import { waLink } from "@/components/site/whatsapp-fab";
import { WhatsAppIcon } from "@/components/icons";

const STATUS: Record<Notification["status"], [string, string]> = {
  sent: ["أُرسلت تلقائيًا", "text-sign"],
  manual: ["أُرسلت يدويًا", "text-sign"],
  pending: ["جاهزة للإرسال اليدوي", "text-amber-deep"],
  failed: ["فشل الإرسال", "text-danger"],
};

/** Messages with their state, and the buttons to send by hand / retry */
export function NotificationList({ rows, showBooking = false }: { rows: (Notification & { ref?: string | null; number?: number | null })[]; showBooking?: boolean }) {
  if (!rows.length) return <p className="px-5 py-4 text-sm text-muted">لا توجد رسائل.</p>;
  return (
    <ul className="divide-y divide-line" data-testid="notification-list">
      {rows.map((n) => {
        const [label, cls] = STATUS[n.status];
        const open = n.status === "pending" || n.status === "failed";
        return (
          <li key={n.id} className="px-5 py-3 text-sm" data-status={n.status} data-kind={n.kind}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {KIND_LABELS[n.kind as NotifyKind] ?? n.kind} <span className="text-muted font-normal">← {n.recipientName || n.recipient}</span>
              </p>
              <p className={cls}>{label}</p>
            </div>
            <p className="text-xs text-muted mt-0.5">
              {n.channel === "whatsapp" ? "واتساب" : "بريد"} · <bdi dir="ltr">{n.recipient}</bdi> · {formatDateTime(n.createdAt, "ar")}
              {showBooking && n.ref && (
                <>
                  {" · "}
                  <Link href={`/admin/bookings/${n.ref}`} className="text-sign hover:underline" dir="ltr">
                    {bookingNo(n.number)}
                  </Link>
                </>
              )}
            </p>
            {n.error && <p className="mt-1 text-xs text-danger">{n.error}</p>}
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-sign">نص الرسالة</summary>
              <p className="mt-1 whitespace-pre-line rounded-md bg-stone px-3 py-2">{n.body}</p>
            </details>
            {open && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {n.channel === "whatsapp" ? (
                  <a href={waLink(n.recipient, n.body)} target="_blank" rel="noopener noreferrer" className="btn btn-primary !min-h-9 !py-1 text-sm">
                    <WhatsAppIcon className="size-4" /> إرسال عبر واتساب
                  </a>
                ) : (
                  <a href={`mailto:${n.recipient}?subject=${encodeURIComponent(n.subject)}&body=${encodeURIComponent(n.body)}`} className="btn btn-primary !min-h-9 !py-1 text-sm">
                    إرسال من البريد
                  </a>
                )}
                <ActionForm action={markNotificationManual} submitLabel="تم الإرسال" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm" className="">
                  <input type="hidden" name="id" value={n.id} />
                </ActionForm>
                <ActionForm action={retryNotification} submitLabel="إعادة المحاولة تلقائيًا" pendingLabel="جارٍ الإرسال…" submitClassName="btn btn-ghost !min-h-9 !py-1 text-sm" className="">
                  <input type="hidden" name="id" value={n.id} />
                </ActionForm>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
