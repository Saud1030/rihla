import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EXPORT_MAX, listBookings, parseBookingFilters } from "@/lib/admin-data";
import { bookingsPdf, bookingsXlsx } from "@/lib/bookings-export";
import { todayInRiyadh } from "@/lib/booking";

/** Download the bookings list, with the page's filters: ?format=xlsx|pdf&status=...&from=... (bookings section only) */
export async function GET(req: Request) {
  if (!can(await getSession(), "bookings")) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") === "pdf" ? "pdf" : "xlsx";
  const filters = parseBookingFilters(sp);
  const { rows, total } = await listBookings(filters, { all: true });
  const day = todayInRiyadh();
  const range = filters.from || filters.to ? ` (${filters.from ?? "…"} - ${filters.to ?? "…"})` : "";
  const title = `الحجوزات${range} — ${rows.length.toLocaleString("ar-SA")} حجز${total > EXPORT_MAX ? ` من ${total.toLocaleString("ar-SA")}` : ""} — ${day}`;
  const file = format === "pdf" ? await bookingsPdf(rows, title) : await bookingsXlsx(rows, title);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bookings-${day}.${format}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
