import "server-only";
import { and, asc, count, desc, eq, gte, ilike, lte, or, sql, sum, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { todayInRiyadh } from "@/lib/booking";
import type { Booking } from "@/db/schema";

const PAID_STATES = ["paid", "confirmed", "completed"] as const;

export async function getDashboardStats() {
  const today = todayInRiyadh();
  const monthStart = `${today.slice(0, 7)}-01`;
  const in7 = new Date(Date.now() + 7 * 864e5);
  const in7Str = todayInRiyadh(in7);

  const [[pendingPay], [toConfirm], [monthRevenue], [todayCount], upcoming, [refunds], [transfers], [withReceipt]] = await Promise.all([
    db.select({ n: count() }).from(s.bookings).where(eq(s.bookings.status, "pending_payment")),
    db.select({ n: count() }).from(s.bookings).where(eq(s.bookings.status, "paid")),
    db
      .select({ total: sum(s.bookings.amount), n: count() })
      .from(s.bookings)
      .where(and(inArray(s.bookings.status, [...PAID_STATES]), gte(s.bookings.paidAt, new Date(`${monthStart}T00:00:00+03:00`)))),
    db
      .select({ n: count() })
      .from(s.bookings)
      .where(and(inArray(s.bookings.status, [...PAID_STATES]), eq(s.bookings.pickupDate, today))),
    db
      .select()
      .from(s.bookings)
      .where(
        and(inArray(s.bookings.status, ["paid", "confirmed"]), gte(s.bookings.pickupDate, today), lte(s.bookings.pickupDate, in7Str)),
      )
      .orderBy(asc(s.bookings.pickupDate), asc(s.bookings.pickupTime))
      .limit(15),
    db.select({ n: count() }).from(s.bookings).where(inArray(s.bookings.refundStatus, ["pending_approval", "failed"])),
    db
      .select({ n: count() })
      .from(s.bookings)
      .where(and(eq(s.bookings.status, "pending_payment"), eq(s.bookings.paymentMethod, "bank_transfer"))),
    db
      .select({ n: sql<number>`count(distinct ${s.receipts.bookingId})::int` })
      .from(s.receipts)
      .innerJoin(s.bookings, eq(s.bookings.id, s.receipts.bookingId))
      .where(and(eq(s.bookings.status, "pending_payment"), eq(s.bookings.paymentMethod, "bank_transfer"))),
  ]);

  return {
    pendingPayment: pendingPay.n,
    toConfirm: toConfirm.n,
    monthRevenue: Number(monthRevenue.total ?? 0),
    monthPaidCount: monthRevenue.n,
    todayPickups: todayCount.n,
    refundsWaiting: refunds.n,
    transfersWaiting: transfers.n,
    transfersWithReceipt: withReceipt.n,
    upcoming: await withTableInfo(upcoming),
  };
}

export type BookingFilters = {
  status?: (typeof s.bookingStatus.enumValues)[number];
  q?: string;
  from?: string; // pickup date range
  to?: string;
  timeFrom?: string; // pickup time range, HH:MM
  timeTo?: string;
  customer?: string; // name
  phone?: string; // customer mobile, any part
  city?: string; // cities.slug, at either end of the trip
  place?: number; // locations.id, at either end of the trip
  driver?: number | "none";
  vehicle?: number;
  page?: number;
};

/** the trip touches these places (its own from/to, or its fixed route's two ends) */
const touches = (placeCond: ReturnType<typeof sql>) => sql`(
  exists (select 1 from ${s.locations} l where l.id in (${s.bookings.fromLocationId}, ${s.bookings.toLocationId}) and ${placeCond})
  or exists (select 1 from ${s.trips} t join ${s.routes} r on r.id = t.route_id join ${s.locations} l on l.id in (r.from_location_id, r.to_location_id)
             where t.id = ${s.bookings.tripId} and ${placeCond})
)`;

export const PAGE_SIZE = 25;

export async function listBookings(f: BookingFilters) {
  const where = [];
  if (f.status) where.push(eq(s.bookings.status, f.status));
  if (f.from) where.push(gte(s.bookings.pickupDate, f.from));
  if (f.to) where.push(lte(s.bookings.pickupDate, f.to));
  if (f.timeFrom) where.push(gte(s.bookings.pickupTime, f.timeFrom));
  if (f.timeTo) where.push(lte(s.bookings.pickupTime, f.timeTo));
  const like = (v: string) => `%${v.replace(/[%_\\]/g, "\\$&")}%`;
  if (f.customer) where.push(ilike(s.bookings.customerName, like(f.customer)));
  if (f.phone) {
    // match on digits, whatever way the number was typed (05..., 9665..., +966...)
    const digits = f.phone.replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/\D/g, "").replace(/^(00966|966|0)/, "");
    if (digits) where.push(ilike(s.bookings.customerPhone, like(digits)));
  }
  if (f.city) where.push(touches(sql`l.city = ${f.city}`));
  if (f.place) where.push(touches(sql`l.id = ${f.place}`));
  if (f.driver === "none") where.push(sql`${s.bookings.driverId} is null`);
  else if (f.driver) where.push(eq(s.bookings.driverId, f.driver));
  if (f.vehicle) where.push(eq(s.bookings.vehicleId, f.vehicle));
  if (f.q) {
    const q = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    // "MHT12" or "12" finds booking number 12
    const num = /^(?:mht)?\s*0*(\d{1,9})$/i.exec(f.q.trim())?.[1];
    where.push(
      or(ilike(s.bookings.ref, q), ilike(s.bookings.customerName, q), ilike(s.bookings.customerPhone, q), ...(num ? [eq(s.bookings.number, Number(num))] : []))!,
    );
  }
  const cond = where.length ? and(...where) : undefined;
  const page = Math.max(1, f.page ?? 1);

  const [rows, [{ n }]] = await Promise.all([
    db
      .select()
      .from(s.bookings)
      .where(cond)
      .orderBy(desc(s.bookings.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(s.bookings).where(cond),
  ]);
  // which of these bookings have a transfer receipt uploaded
  const ids = rows.map((r) => r.id);
  const withReceipt = new Set(
    ids.length
      ? (await db.selectDistinct({ id: s.receipts.bookingId }).from(s.receipts).where(inArray(s.receipts.bookingId, ids))).map((r) => r.id)
      : [],
  );
  return {
    rows: await withTableInfo(rows.map((r) => ({ ...r, hasReceipt: withReceipt.has(r.id) }))),
    total: n,
    page,
    pages: Math.max(1, Math.ceil(n / PAGE_SIZE)),
  };
}

export async function getBookingWithPayments(ref: string) {
  const b = await db.query.bookings.findFirst({
    where: eq(s.bookings.ref, ref.toUpperCase()),
    with: { payments: { orderBy: desc(s.payments.createdAt) } },
  });
  if (!b) return b;
  // receipt files are served separately, admins only; here just their details
  const receipts = await db
    .select({ id: s.receipts.id, mime: s.receipts.mime, fileName: s.receipts.fileName, size: s.receipts.size, createdAt: s.receipts.createdAt })
    .from(s.receipts)
    .where(eq(s.receipts.bookingId, b.id))
    .orderBy(desc(s.receipts.createdAt));
  return { ...b, receipts };
}

/** Everything the price matrix needs, including inactive trips. */
export async function getPriceMatrix() {
  const [routes, vehicles, trips] = await Promise.all([
    db.query.routes.findMany({ orderBy: [asc(s.routes.sortOrder), asc(s.routes.id)], with: { from: true, to: true } }),
    db.select().from(s.vehicles).orderBy(asc(s.vehicles.sortOrder), asc(s.vehicles.id)),
    db.select().from(s.trips),
  ]);
  const byKey = new Map(trips.map((t) => [`${t.routeId}_${t.vehicleId}`, t]));
  return { routes, vehicles, byKey };
}

export async function getRoutesAdmin() {
  const [routes, locations, cities, tripCounts] = await Promise.all([
    db.query.routes.findMany({ orderBy: [asc(s.routes.sortOrder), asc(s.routes.id)], with: { from: true, to: true } }),
    db.select().from(s.locations).orderBy(asc(s.locations.sortOrder), asc(s.locations.id)),
    db.select().from(s.cities).orderBy(asc(s.cities.sortOrder), asc(s.cities.id)),
    db
      .select({ routeId: s.trips.routeId, n: count() })
      .from(s.trips)
      .where(eq(s.trips.active, true))
      .groupBy(s.trips.routeId),
  ]);
  const counts = new Map(tripCounts.map((r) => [r.routeId, r.n]));
  return { routes, locations, cities, counts };
}

export async function bookingCountsByStatus() {
  const rows = await db.select({ status: s.bookings.status, n: count() }).from(s.bookings).groupBy(s.bookings.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}


/* ---------- Chat ---------- */

export type ChatFilter = "needs_reply" | "staff" | "all";

/** Conversations for the inbox, the ones waiting for a reply first, with the last message as a preview */
export async function listConversations(filter: ChatFilter) {
  const lastBody = sql<string>`(select m.body from chat_messages m where m.conversation_id = chat_conversations.id order by m.id desc limit 1)`;
  const lastFrom = sql<string>`(select m.sender from chat_messages m where m.conversation_id = chat_conversations.id order by m.id desc limit 1)`;
  const msgCount = sql<number>`(select count(*)::int from chat_messages m where m.conversation_id = chat_conversations.id)`;
  const where =
    filter === "needs_reply"
      ? and(inArray(s.chatConversations.status, ["waiting", "open"]), gte(s.chatConversations.unreadAdmin, 1))
      : filter === "staff"
        ? inArray(s.chatConversations.status, ["waiting", "open"])
        : undefined;
  const rows = await db
    .select({ c: s.chatConversations, lastBody, lastFrom, msgCount })
    .from(s.chatConversations)
    .where(where)
    .orderBy(desc(sql`(${s.chatConversations.unreadAdmin} > 0 and ${s.chatConversations.status} in ('waiting','open'))`), desc(s.chatConversations.lastMessageAt))
    .limit(150);
  return rows.filter((r) => r.msgCount > 0);
}

export async function chatCounts() {
  const [[needs], [staff]] = await Promise.all([
    db
      .select({ n: count() })
      .from(s.chatConversations)
      .where(and(inArray(s.chatConversations.status, ["waiting", "open"]), gte(s.chatConversations.unreadAdmin, 1))),
    db.select({ n: count() }).from(s.chatConversations).where(inArray(s.chatConversations.status, ["waiting", "open"])),
  ]);
  return { needsReply: needs.n, withStaff: staff.n };
}

export async function getConversationAdmin(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await db.select().from(s.chatConversations).where(eq(s.chatConversations.id, id)).limit(1);
  if (!c) return null;
  const messages = await db.select().from(s.chatMessages).where(eq(s.chatMessages.conversationId, c.id)).orderBy(asc(s.chatMessages.id));
  return { ...c, messages };
}

/** Opening a conversation counts as reading it */
export async function markConversationRead(id: string) {
  await db.update(s.chatConversations).set({ unreadAdmin: 0 }).where(and(eq(s.chatConversations.id, id), gte(s.chatConversations.unreadAdmin, 1)));
}

export async function listFaqsAdmin() {
  return db.select().from(s.chatFaqs).orderBy(asc(s.chatFaqs.sortOrder), asc(s.chatFaqs.id));
}

export type TableBooking = Booking & {
  hasReceipt?: boolean;
  fromName?: string | null;
  toName?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
};

/** Adds what the bookings table shows in its own columns: from / to place names and the driver */
export async function withTableInfo<T extends Booking>(rows: T[]): Promise<(T & TableBooking)[]> {
  // fixed-route bookings may only point at their route: take its two ends (swapped when booked in reverse)
  const tripIds = [...new Set(rows.filter((r) => !r.fromLocationId && r.tripId).map((r) => r.tripId!))];
  const tripEnds = new Map(
    (tripIds.length
      ? await db
          .select({ id: s.trips.id, from: s.routes.fromLocationId, to: s.routes.toLocationId })
          .from(s.trips)
          .innerJoin(s.routes, eq(s.routes.id, s.trips.routeId))
          .where(inArray(s.trips.id, tripIds))
      : []
    ).map((t) => [t.id, t]),
  );
  const ends = (r: Booking) => {
    if (r.fromLocationId) return [r.fromLocationId, r.toLocationId] as const;
    const t = r.tripId ? tripEnds.get(r.tripId) : undefined;
    if (!t) return [null, null] as const;
    return r.reversed ? ([t.to, t.from] as const) : ([t.from, t.to] as const);
  };
  const locIds = [...new Set(rows.flatMap((r) => ends(r)).filter((x): x is number => !!x))];
  const driverIds = [...new Set(rows.map((r) => r.driverId).filter((x): x is number => !!x))];
  const vehicleIds = [...new Set(rows.map((r) => r.vehicleId).filter((x): x is number => !!x))];
  const [locs, drivers, vehicles] = await Promise.all([
    locIds.length ? db.select({ id: s.locations.id, name: s.locations.nameAr }).from(s.locations).where(inArray(s.locations.id, locIds)) : [],
    driverIds.length ? db.select({ id: s.drivers.id, name: s.drivers.name, phone: s.drivers.phone }).from(s.drivers).where(inArray(s.drivers.id, driverIds)) : [],
    vehicleIds.length ? db.select({ id: s.vehicles.id, name: s.vehicles.nameAr }).from(s.vehicles).where(inArray(s.vehicles.id, vehicleIds)) : [],
  ]);
  const car = new Map(vehicles.map((v) => [v.id, v.name]));
  const loc = new Map(locs.map((l) => [l.id, l.name]));
  const drv = new Map(drivers.map((d) => [d.id, d]));
  // older or custom-titled bookings without places: split the saved title "A ← B"
  const split = (t: string) => t.split(/\s*[←→]\s*/);
  return rows.map((r) => {
    const parts = split(r.routeTitle);
    const d = r.driverId ? drv.get(r.driverId) : undefined;
    const [fromId, toId] = ends(r);
    return {
      ...r,
      // the panel is in Arabic: the car's Arabic name even when the customer booked in English
      vehicleName: (r.vehicleId && car.get(r.vehicleId)) || r.vehicleName,
      fromName: (fromId && loc.get(fromId)) || parts[0] || r.routeTitle,
      toName: (toId && loc.get(toId)) || (parts.length > 1 ? parts.slice(1).join(" ← ") : null),
      driverName: d?.name ?? null,
      driverPhone: d?.phone ?? null,
    };
  });
}
