import Link from "next/link";
import type { Booking } from "@/db/schema";
import { getDictionary } from "@/i18n/dictionaries";
import { formatDate, formatSAR, formatTime } from "@/lib/format";
import { StatusBadge } from "@/components/site/booking-summary";

const t = getDictionary("ar");

export function BookingsTable({ rows, empty = "لا توجد حجوزات." }: { rows: (Booking & { hasReceipt?: boolean })[]; empty?: string }) {
  if (!rows.length) return <p className="p-8 text-center text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-muted text-start">
          <tr className="border-b border-line">
            <th className="text-start font-medium px-4 py-3">الرقم</th>
            <th className="text-start font-medium px-4 py-3">موعد الاستلام</th>
            <th className="text-start font-medium px-4 py-3">الرحلة</th>
            <th className="text-start font-medium px-4 py-3">العميل</th>
            <th className="text-start font-medium px-4 py-3">المبلغ</th>
            <th className="text-start font-medium px-4 py-3">الحالة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-stone/60">
              <td className="px-4 py-3">
                <Link href={`/admin/bookings/${b.ref}`} className="font-display font-medium text-sign hover:underline" dir="ltr">
                  {b.ref}
                </Link>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {formatDate(b.pickupDate, "ar")}
                <span className="block text-muted">{formatTime(b.pickupTime, "ar")}</span>
              </td>
              <td className="px-4 py-3 min-w-56">
                {b.routeTitle}
                <span className="block text-muted">{b.vehicleName}</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {b.customerName}
                <span className="block text-muted" dir="ltr" style={{ textAlign: "right" }}>
                  {b.customerPhone}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap tabular">{formatSAR(b.amount, "ar")}</td>
              <td className="px-4 py-3">
                <StatusBadge status={b.status} t={t} />
                {b.status === "pending_payment" && b.paymentMethod === "bank_transfer" && (
                  <span className="block text-xs text-amber-deep mt-1">تحويل بنكي{b.hasReceipt ? " · إيصال مرفوع" : ""}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
