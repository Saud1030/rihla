import Link from "next/link";
import { getDictionary } from "@/i18n/dictionaries";
import { bookingNo, formatDate, formatSAR, formatTime } from "@/lib/format";
import type { TableBooking } from "@/lib/admin-data";
import { StatusBadge } from "@/components/site/booking-summary";

const t = getDictionary("ar");

const Phone = ({ n }: { n?: string | null }) =>
  n ? (
    <a href={`tel:${n}`} dir="ltr" className="hover:text-sign tabular" style={{ unicodeBidi: "isolate" }}>
      {n}
    </a>
  ) : (
    <span className="text-muted">—</span>
  );

/** Bookings, one piece of information per column */
export function BookingsTable({ rows, empty = "لا توجد حجوزات." }: { rows: TableBooking[]; empty?: string }) {
  if (!rows.length) return <p className="p-8 text-center text-muted">{empty}</p>;
  const th = "text-start font-medium px-3 py-3 whitespace-nowrap";
  const td = "px-3 py-3 align-top";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="bookings-table">
        <thead className="text-muted text-start">
          <tr className="border-b border-line">
            <th className={th}>رقم الحجز</th>
            <th className={th}>التاريخ</th>
            <th className={th}>الوقت</th>
            <th className={th}>من</th>
            <th className={th}>إلى</th>
            <th className={th}>السيارة</th>
            <th className={th}>العميل</th>
            <th className={th}>جوال العميل</th>
            <th className={th}>السائق</th>
            <th className={th}>جوال السائق</th>
            <th className={th}>المبلغ</th>
            <th className={th}>الحالة</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((b) => (
            <tr key={b.id} className="hover:bg-stone/60">
              <td className={td}>
                <Link href={`/admin/bookings/${b.ref}`} className="font-display font-semibold text-sign hover:underline whitespace-nowrap" dir="ltr">
                  {bookingNo(b.number)}
                </Link>
              </td>
              <td className={`${td} whitespace-nowrap`}>{formatDate(b.pickupDate, "ar", { weekday: false })}</td>
              <td className={`${td} whitespace-nowrap`}>{formatTime(b.pickupTime, "ar")}</td>
              <td className={`${td} min-w-36`}>{b.fromName}</td>
              <td className={`${td} min-w-36`}>{b.toName ?? (b.hours ? `بالساعة · ${b.hours} ساعة` : "—")}</td>
              <td className={`${td} whitespace-nowrap`}>{b.vehicleName}</td>
              <td className={`${td} whitespace-nowrap`}>{b.customerName}</td>
              <td className={`${td} whitespace-nowrap`}>
                <Phone n={b.customerPhone} />
              </td>
              <td className={`${td} whitespace-nowrap`}>{b.driverName ?? <span className="text-muted">لم يُحدَّد</span>}</td>
              <td className={`${td} whitespace-nowrap`}>
                <Phone n={b.driverPhone} />
              </td>
              <td className={`${td} whitespace-nowrap tabular`}>{formatSAR(b.amount, "ar")}</td>
              <td className={td}>
                <StatusBadge status={b.status} t={t} />
                {b.status === "pending_payment" && b.paymentMethod === "bank_transfer" && (
                  <span className="block text-xs text-amber-deep mt-1 whitespace-nowrap">تحويل بنكي{b.hasReceipt ? " · إيصال مرفوع" : ""}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
