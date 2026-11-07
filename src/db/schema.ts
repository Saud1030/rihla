import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  doublePrecision,
  customType,
  uuid,
  date,
  uniqueIndex,
  index,
  pgSequence,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/* ---------- Enums ---------- */

export const vehicleCategory = pgEnum("vehicle_category", [
  "sedan",
  "suv",
  "van",
  "coaster",
  "bus",
]);

export const routeKind = pgEnum("route_kind", ["transfer", "ziyarat"]);

/** What kind of place a destination is (used for icons, grouping and search) */
export const locationKind = pgEnum("location_kind", [
  "airport",
  "station", // train station
  "city", // city centre / any address in the city
  "hotels", // hotel area (e.g. around the Haram)
  "religious", // mosques, holy sites, miqat
  "landmark", // tourist and historic sites
  "other",
]);

export const pricingMode = pgEnum("pricing_mode", ["fixed", "distance", "hourly", "multi", "package"]);

export const refundStatus = pgEnum("refund_status", [
  "none", // nothing to refund
  "pending_approval", // customer cancelled, waiting for the admin to approve the refund
  "requested", // sent to MyFatoorah, their finance team executes it
  "manual", // handled outside the system (marked by the admin)
  "failed", // the refund request to MyFatoorah failed
]);

/** how the customer chose to pay */
export const paymentMethod = pgEnum("payment_method", ["myfatoorah", "bank_transfer", "cash"]);

/** running numbers of payment vouchers and invoices (never reused, even if a number is skipped) */
export const receiptSeq = pgSequence("receipt_no_seq", { startWith: 1 });
export const invoiceSeq = pgSequence("invoice_no_seq", { startWith: 1 });

export const bookingStatus = pgEnum("booking_status", [
  "pending_payment", // created, waiting for payment
  "paid", // payment verified with the gateway
  "confirmed", // driver assigned / confirmed by staff
  "completed",
  "cancelled",
]);

export const paymentStatus = pgEnum("payment_status", [
  "initiated",
  "paid",
  "failed",
  "authorized",
  "captured",
  "refunded",
  "voided",
]);

/* ---------- Catalog ---------- */

/** A vehicle model in the fleet (Camry, GMC Yukon, Hiace, Coaster, Bus ...) */
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  category: vehicleCategory("category").notNull(),
  passengers: integer("passengers").notNull(),
  bags: integer("bags").notNull(),
  imageUrl: text("image_url"),
  /** list of { ar, en } feature labels */
  features: jsonb("features").$type<{ ar: string; en: string }[]>().notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  /* Distance pricing, used for any two destinations without a fixed route price (halalas) */
  baseFare: integer("base_fare").notNull().default(6000),
  perKm: integer("per_km").notNull().default(120),
  minFare: integer("min_fare").notNull().default(10000),
  /* Hourly packages with a driver (halalas, before VAT) */
  hourly10: integer("hourly_10").notNull().default(55000),
  hourly12: integer("hourly_12").notNull().default(60000),
  hourly24: integer("hourly_24").notNull().default(100000),
});

/** Saudi administrative regions are a fixed list (see src/lib/regions.ts); cities belong to one */
export const cities = pgTable("cities", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  region: text("region").notNull(),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

/** A place you can be picked up from or dropped at (airport, hotel area, landmark ...) */
export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    nameAr: text("name_ar").notNull(),
    nameEn: text("name_en").notNull(),
    /** cities.slug */
    city: text("city").notNull(),
    kind: locationKind("kind").notNull().default("city"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("locations_city_idx").on(t.city)],
);

/** A route between two locations (or a ziyarat tour inside one city) */
export const routes = pgTable(
  "routes",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    kind: routeKind("kind").notNull().default("transfer"),
    fromLocationId: integer("from_location_id")
      .notNull()
      .references(() => locations.id),
    /** null for ziyarat tours */
    toLocationId: integer("to_location_id").references(() => locations.id),
    /** price applies in both directions */
    bidirectional: boolean("bidirectional").notNull().default(true),
    distanceKm: integer("distance_km"),
    durationMin: integer("duration_min"),
    titleAr: text("title_ar"),
    titleEn: text("title_en"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("routes_from_idx").on(t.fromLocationId)],
);

/** The sellable "product": one route on one vehicle at one price */
export const trips = pgTable(
  "trips",
  {
    id: serial("id").primaryKey(),
    routeId: integer("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    /** price in halalas (1 SAR = 100 halalas) */
    price: integer("price").notNull(),
    /** optional "was" price in halalas */
    compareAtPrice: integer("compare_at_price"),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("trips_route_vehicle_uq").on(t.routeId, t.vehicleId)],
);

/* ---------- Orders ---------- */

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** public, unguessable reference shown to the customer */
    ref: text("ref").notNull().unique(),
    /** running booking number for staff: shown as MHT01, MHT02 ... (see bookingNo) */
    number: serial("number").notNull().unique(),
    tripId: integer("trip_id").references(() => trips.id, { onDelete: "set null" }),
    /** fixed = a priced route (tripId); distance = priced from the distance between two destinations */
    pricingMode: pricingMode("pricing_mode").notNull().default("fixed"),
    fromLocationId: integer("from_location_id").references(() => locations.id, { onDelete: "set null" }),
    toLocationId: integer("to_location_id").references(() => locations.id, { onDelete: "set null" }),
    vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
    distanceKm: integer("distance_km"),
    /** hourly bookings: 10, 12 or 24 */
    hours: integer("hours"),
    /** multi-destination trip: every place in order (start, stops...), names in the booking's language */
    stops: jsonb("stops").$type<string[]>(),
    /** multi-destination trip: when the car is at each place ("YYYY-MM-DD HH:MM"), null where not set (stops 3+ have one) */
    stopTimes: jsonb("stop_times").$type<(string | null)[]>(),
    /** multi-trip made of separate trips: each with its own start, end and time ("YYYY-MM-DD HH:MM"), names in the booking's language */
    legs: jsonb("legs").$type<{ from: string; to: string; at: string }[]>(),
    /** hourly bookings by city: the city's slug */
    hourlyCity: text("hourly_city"),
    /** how long the booking lasts in minutes (hourly package, or estimated drive), for the end time */
    durationMin: integer("duration_min"),
    /** null until the customer picks a payment method on the checkout page */
    paymentMethod: paymentMethod("payment_method"),
    /** snapshot so the order stays readable if the catalog changes */
    routeTitle: text("route_title").notNull(),
    vehicleName: text("vehicle_name").notNull(),
    reversed: boolean("reversed").notNull().default(false),

    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    passengers: integer("passengers").notNull(),
    bags: integer("bags").notNull().default(0),
    pickupDate: date("pickup_date").notNull(),
    pickupTime: text("pickup_time").notNull(),
    pickupAddress: text("pickup_address").notNull(),
    dropoffAddress: text("dropoff_address"),
    flightNumber: text("flight_number"),
    notes: text("notes"),

    /** price before VAT, in halalas, always computed on the server */
    subtotal: integer("subtotal").notNull().default(0),
    /** VAT rate in basis points (1500 = 15%) at the time of booking */
    vatRate: integer("vat_rate").notNull().default(0),
    vatAmount: integer("vat_amount").notNull().default(0),
    /** total charged = subtotal + vatAmount, in halalas */
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("SAR"),
    status: bookingStatus("status").notNull().default("pending_payment"),
    /** latest MyFatoorah invoice created for this booking */
    invoiceId: text("invoice_id"),
    /** the gateway payment that settled this booking (one payment => one booking) */
    paymentId: text("payment_id").unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    locale: text("locale").notNull().default("ar"),
    adminNote: text("admin_note"),
    /* Cancellation & refund */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: text("cancelled_by"), // customer | admin
    refundAmount: integer("refund_amount").notNull().default(0),
    refundStatus: refundStatus("refund_status").notNull().default("none"),
    refundReference: text("refund_reference"),
    refundError: text("refund_error"),
    /* Driver and rating */
    driverId: integer("driver_id").references((): AnyPgColumn => drivers.id, { onDelete: "set null" }),
    driverAssignedAt: timestamp("driver_assigned_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** sha256 of the secret in the customer's rating link */
    ratingTokenHash: text("rating_token_hash").unique(),
    ratingRequestedAt: timestamp("rating_requested_at", { withTimezone: true }),
    /** what the driver is paid for this trip (halalas), set by the admin; shown to the driver */
    driverFare: integer("driver_fare"),
    /* Payment voucher (sent when paid) and tax invoice (sent when the trip ends); numbered in order */
    receiptNo: integer("receipt_no").unique(),
    receiptAt: timestamp("receipt_at", { withTimezone: true }),
    invoiceNo: integer("invoice_no").unique(),
    invoiceAt: timestamp("invoice_at", { withTimezone: true }),
    /** promo code used for this booking, and the discount it gave (halalas, before VAT) */
    promoCode: text("promo_code"),
    discount: integer("discount").notNull().default(0),
    /** season increase (+) and offer discount (-) by the trip date, halalas, before the promo code; and what they were */
    priceAdjust: integer("price_adjust").notNull().default(0),
    priceAdjustNote: text("price_adjust_note").notNull().default(""),
    /** a package booking (Admin -> Packages): paid in installments, see the installments table */
    packageId: integer("package_id"),
    /** the tax invoice sent to the e-invoicing platform (Admin -> Settings -> E-invoicing) */
    einvoiceId: text("einvoice_id"),
    einvoiceStatus: text("einvoice_status"),
    einvoiceError: text("einvoice_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("bookings_status_idx").on(t.status),
    index("bookings_created_idx").on(t.createdAt),
    index("bookings_pickup_idx").on(t.pickupDate),
    index("bookings_driver_idx").on(t.driverId),
  ],
);

/** Every payment we heard about from the gateway (audit log) */
export const payments = pgTable("payments", {
  id: text("id").primaryKey(), // gateway payment id (MyFatoorah PaymentId)
  invoiceId: text("invoice_id"),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  status: paymentStatus("status").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  source: text("source"), // payment method name as reported by the gateway (mada, VISA/MASTER, Apple Pay ...)
  raw: jsonb("raw"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Admin & settings ---------- */

/** owner: everything; staff: the sections in `permissions`; driver: only their own trips */
export const userRole = pgEnum("user_role", ["owner", "staff", "driver"]);

export const adminUsers = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  /** sign-in by email or by mobile number (+966...); at least one of the two is set */
  email: text("email").unique(),
  phone: text("phone").unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("owner"),
  /** staff only: section keys from src/lib/permissions.ts */
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  /** driver accounts: which driver they are */
  driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Drivers ---------- */
/** pending: applied from the website, waiting for review; approved: can be given trips; rejected: application refused */
export const driverStatus = pgEnum("driver_status", ["pending", "approved", "rejected"]);

export const drivers = pgTable("drivers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** mobile / WhatsApp in +966... form */
  phone: text("phone").notNull(),
  email: text("email").notNull().default(""),
  plateNumber: text("plate_number").notNull(),
  /** car make and name, e.g. Toyota Camry */
  carType: text("car_type").notNull(),
  /** model year */
  carModel: text("car_model").notNull().default(""),
  carColor: text("car_color").notNull().default(""),
  photoMime: text("photo_mime"),
  photo: bytea("photo"),
  notes: text("notes").notNull().default(""),
  active: boolean("active").notNull().default(true),
  /** which car of the fleet list (Admin -> Vehicles) the driver has; carType keeps its name */
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  status: driverStatus("status").notNull().default("approved"),
  rejectReason: text("reject_reason"),
  /** where the driver wants his money (bank name, IBAN, account name), as he wrote it */
  bankAccount: text("bank_account").notNull().default(""),
  /** blocked by the admin: can't sign in, get trips or apply again, until unblocked */
  blockedAt: timestamp("blocked_at", { withTimezone: true }),
  blockReason: text("block_reason"),
  /** suspended for a while: can't sign in or get trips until this time; lifts by itself */
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  suspendReason: text("suspend_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Documents a driver uploads when applying: ID, car registration (istimara), car inside and outside */
export const driverDocKind = pgEnum("driver_doc_kind", [
  "id_card",
  "license",
  "registration",
  "car_inside",
  "car_outside",
  "iban",
  "car_outside_back",
  "car_outside_side",
  "car_inside_back",
  "car_inside_dash",
]);
export const driverDocuments = pgTable(
  "driver_documents",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    kind: driverDocKind("kind").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("driver_documents_driver_kind_uq").on(t.driverId, t.kind)],
);

/** One rating per booking: the driver and the company, 1 to 5 stars */
export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: "cascade" }),
    driverId: integer("driver_id").references(() => drivers.id, { onDelete: "set null" }),
    driverStars: integer("driver_stars").notNull(),
    companyStars: integer("company_stars").notNull(),
    comment: text("comment").notNull().default(""),
    /** shown in "what our customers say" on the website (the admin can hide it) */
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ratings_driver_idx").on(t.driverId), index("ratings_created_idx").on(t.createdAt)],
);

/* ---------- Outgoing WhatsApp messages and emails ---------- */
export const notifyChannel = pgEnum("notify_channel", ["whatsapp", "email"]);
/** pending: not sent yet (no provider or waiting); sent: accepted by the provider; failed: provider refused; manual: sent by hand from the panel */
export const notifyStatus = pgEnum("notify_status", ["pending", "sent", "failed", "manual"]);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    channel: notifyChannel("channel").notNull(),
    /** driver_trip | customer_driver | rating_request | rating_received */
    kind: text("kind").notNull(),
    recipient: text("recipient").notNull(),
    recipientName: text("recipient_name").notNull().default(""),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull(),
    /** template parameters, in order, for WhatsApp templates */
    params: jsonb("params").$type<string[]>().notNull().default([]),
    /** a file sent with the message (WhatsApp document), e.g. the payment voucher PDF */
    attachmentUrl: text("attachment_url"),
    attachmentName: text("attachment_name"),
    status: notifyStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    providerId: text("provider_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt), index("notifications_booking_idx").on(t.bookingId)],
);

/** Uploaded brand files (logo). Kept in the database so they survive redeploys on any host. */
export const assets = pgTable("assets", {
  key: text("key").primaryKey(),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Money paid to a driver (cash, transfer...). His balance = fares of finished trips - these. */
export const driverPayouts = pgTable(
  "driver_payouts",
  {
    id: serial("id").primaryKey(),
    driverId: integer("driver_id")
      .notNull()
      .references(() => drivers.id, { onDelete: "cascade" }),
    /** halalas */
    amount: integer("amount").notNull(),
    paidOn: date("paid_on").notNull(),
    note: text("note").notNull().default(""),
    /** bank transfer (needs the transfer receipt) or cash */
    method: text("method").notNull().default("transfer"),
    receipt: bytea("receipt"),
    receiptMime: text("receipt_mime"),
    createdBy: text("created_by").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("driver_payouts_driver_idx").on(t.driverId)],
);
export type DriverPayout = typeof driverPayouts.$inferSelect;

/** Car with a driver by the hour, priced per city (Admin -> Hourly prices). Missing -> the car's own hourly price. */
export const cityHourlyPrices = pgTable(
  "city_hourly_prices",
  {
    id: serial("id").primaryKey(),
    city: text("city")
      .notNull()
      .references(() => cities.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    vehicleId: integer("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "cascade" }),
    /** 10, 12 or 24 */
    hours: integer("hours").notNull(),
    /** halalas, before VAT */
    price: integer("price").notNull(),
  },
  (t) => [uniqueIndex("city_hourly_prices_uq").on(t.city, t.vehicleId, t.hours)],
);

/** Simple key/value store for editable site settings */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* ---------- Relations ---------- */

export const routesRelations = relations(routes, ({ one, many }) => ({
  from: one(locations, { fields: [routes.fromLocationId], references: [locations.id], relationName: "from" }),
  to: one(locations, { fields: [routes.toLocationId], references: [locations.id], relationName: "to" }),
  trips: many(trips),
}));

export const tripsRelations = relations(trips, ({ one }) => ({
  route: one(routes, { fields: [trips.routeId], references: [routes.id] }),
  vehicle: one(vehicles, { fields: [trips.vehicleId], references: [vehicles.id] }),
}));

export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  trips: many(trips),
}));

/* ---------- Bank-transfer receipts uploaded by customers ---------- */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    fileName: text("file_name").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipts_booking_idx").on(t.bookingId)],
);

/* ---------- Home page banners ---------- */
export const banners = pgTable("banners", {
  id: serial("id").primaryKey(),
  titleAr: text("title_ar").notNull().default(""),
  titleEn: text("title_en").notNull().default(""),
  textAr: text("text_ar").notNull().default(""),
  textEn: text("text_en").notNull().default(""),
  /** where a tap goes: a page of this site ("/ar/routes") or a full https link; empty = not a link */
  link: text("link").notNull().default(""),
  /** "photo": a picture, the title on a dark strip at the bottom; "side": artwork with an empty side where
   *  the title, text and button are written by the site (mirrored for English so the text keeps the empty side) */
  layout: text("layout").notNull().default("photo"),
  /** "dark" artwork gets light text, "light" artwork dark text (side layout) */
  tone: text("tone").notNull().default("dark"),
  /** the button on a side banner (optional) */
  ctaAr: text("cta_ar").notNull().default(""),
  ctaEn: text("cta_en").notNull().default(""),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  /** optional window (Riyadh dates, inclusive) */
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------- Inquiry bot and live chat ---------- */
export const chatFaqs = pgTable("chat_faqs", {
  id: serial("id").primaryKey(),
  questionAr: text("question_ar").notNull(),
  questionEn: text("question_en").notNull().default(""),
  answerAr: text("answer_ar").notNull(),
  answerEn: text("answer_en").notNull().default(""),
  /** extra words that should find this answer, separated by commas */
  keywords: text("keywords").notNull().default(""),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/** bot: talking to the bot; waiting: asked for a staff member; open: staff replied; closed: ended by staff */
export const chatStatus = pgEnum("chat_status", ["bot", "waiting", "open", "closed"]);
export const chatSender = pgEnum("chat_sender", ["customer", "bot", "staff", "system"]);

export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sha256 of the secret kept in the customer's cookie */
    tokenHash: text("token_hash").notNull().unique(),
    locale: text("locale").notNull().default("ar"),
    status: chatStatus("status").notNull().default("bot"),
    customerName: text("customer_name"),
    customerPhone: text("customer_phone"),
    bookingRef: text("booking_ref"),
    unreadAdmin: integer("unread_admin").notNull().default(0),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_conversations_status_idx").on(t.status, t.lastMessageAt)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    sender: chatSender("sender").notNull(),
    body: text("body").notNull(),
    /** which admin replied */
    staffName: text("staff_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_conversation_idx").on(t.conversationId, t.id)],
);

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  trip: one(trips, { fields: [bookings.tripId], references: [trips.id] }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, { fields: [payments.bookingId], references: [bookings.id] }),
}));

export const locationsRelations = relations(locations, ({ one }) => ({
  cityRow: one(cities, { fields: [locations.city], references: [cities.slug] }),
}));

export type Vehicle = typeof vehicles.$inferSelect;
export type City = typeof cities.$inferSelect;
export type Location = typeof locations.$inferSelect;
export type Route = typeof routes.$inferSelect;
export type Trip = typeof trips.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Banner = typeof banners.$inferSelect;
export type ChatFaq = typeof chatFaqs.$inferSelect;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Driver = typeof drivers.$inferSelect;
export type Rating = typeof ratings.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type DriverDocument = typeof driverDocuments.$inferSelect;

/* ---------- Promo codes for loyal customers ---------- */
/**
 * Sent on WhatsApp and email when a customer reaches every Nth paid booking (N set by the admin: 5, 10, 20...).
 * One use; the discount is a percentage of the price before VAT.
 */
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email"),
    /** the discount, % of the price before VAT */
    percent: integer("percent").notNull(),
    /** earned at this many paid bookings; 0 = added and sent by the admin */
    bookingsCount: integer("bookings_count").notNull(),
    /** the booking that earned it */
    earnedBookingId: uuid("earned_booking_id").references(() => bookings.id, { onDelete: "set null" }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBookingId: uuid("used_booking_id").references(() => bookings.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // one code per milestone; codes the admin sends by hand have bookingsCount 0
  (t) => [uniqueIndex("promo_codes_customer_count").on(t.customerPhone, t.bookingsCount).where(sql`${t.bookingsCount} > 0`)],
);
export type PromoCode = typeof promoCodes.$inferSelect;

/** Offers (Admin -> Offers): a % off trips whose date falls between two dates; on or off by hand */
export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull().default(""),
  percent: integer("percent").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type OfferRow = typeof offers.$inferSelect;

/** Busy seasons (Admin -> Seasons): a % increase on trips whose date falls between two dates; on or off by hand */
export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull().default(""),
  percent: integer("percent").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type SeasonRow = typeof seasons.$inferSelect;

/** Packages (Admin -> Packages): a fixed offer with its price, paid in 1 or more installments */
export const packages = pgTable("packages", {
  id: serial("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull().default(""),
  /** one feature per line */
  detailsAr: text("details_ar").notNull().default(""),
  detailsEn: text("details_en").notNull().default(""),
  /** halalas, before VAT (like trip prices) */
  price: integer("price").notNull(),
  /** how many payments: the first when booking, the rest by links the admin sends */
  installments: integer("installments").notNull().default(2),
  /** of those, how many are paid after the trip (the rest before it; the first is always at booking) */
  afterTrip: integer("after_trip").notNull().default(0),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: "set null" }),
  passengers: integer("passengers").notNull().default(4),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PackageRow = typeof packages.$inferSelect;

/** The payments of a package booking. The token is the secret in the customer's payment link. */
export const installments = pgTable(
  "installments",
  {
    id: serial("id").primaryKey(),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    /** before or after the trip (Admin -> Packages) */
    due: text("due").notNull().default("before"),
    /** halalas, VAT included */
    amount: integer("amount").notNull(),
    token: text("token").notNull().unique(),
    invoiceId: text("invoice_id"),
    paymentId: text("payment_id").unique(),
    /** myfatoorah, or how the admin received it by hand (cash, transfer) */
    method: text("method"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    linkSentAt: timestamp("link_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("installments_booking_seq").on(t.bookingId, t.seq)],
);
export type Installment = typeof installments.$inferSelect;
