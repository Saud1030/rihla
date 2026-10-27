/**
 * Replaces all bookings with a handful of realistic sample bookings,
 * useful for demos and screenshots. Never run this on a live database.
 *
 *   npx tsx scripts/demo-bookings.ts
 */
import "dotenv/config";
import postgres from "postgres";
import { randomBytes } from "node:crypto";

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 864e5);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
};
const ref = () => {
  const A = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  return Array.from(randomBytes(8), (b) => A[b % A.length]).join("");
};

const demo = [
  { route: "jeddah-airport-makkah", vehicle: "gmc-yukon", rev: false, name: "عبدالله الشهري", phone: "+966551234870", pax: 6, bags: 6, date: 1, time: "03:40", pickup: "صالة الحجاج، مطار جدة", flight: "SV 803", status: "paid", locale: "ar" },
  { route: "makkah-madinah", vehicle: "toyota-hiace", rev: false, name: "Fatima Khan", phone: "+923001234567", pax: 9, bags: 10, date: 1, time: "09:00", pickup: "Swissôtel Makkah, main lobby", flight: null, status: "confirmed", locale: "en", driver: 0 },
  { route: "madinah-airport-madinah", vehicle: "toyota-camry", rev: true, name: "محمد علي", phone: "+966501112233", pax: 2, bags: 2, date: 2, time: "16:15", pickup: "فندق دار الإيمان إنتركونتيننتال", flight: "XY 512", status: "paid", locale: "ar" },
  { route: "jeddah-airport-madinah", vehicle: "toyota-coaster", rev: false, name: "Yusuf Rahman", phone: "+447700900123", pax: 18, bags: 20, date: 3, time: "11:30", pickup: "North Terminal, arrivals gate 3", flight: "BA 2143", status: "confirmed", locale: "en", note: "مجموعة عمرة من لندن", driver: 1 },
  { route: "makkah-ziyarat", vehicle: "hyundai-staria", rev: false, name: "نورة القحطاني", phone: "+966533445566", pax: 5, bags: 0, date: 4, time: "07:00", pickup: "فندق هيلتون مكة", flight: null, status: "pending_payment", locale: "ar" },
  { route: "makkah-makkah-train", vehicle: "hyundai-sonata", rev: false, name: "Ahmed Hassan", phone: "+201001234567", pax: 3, bags: 3, date: -1, time: "14:00", pickup: "Pullman ZamZam Makkah", flight: null, status: "completed", locale: "en", driver: 2, rating: [5, 5, "Very punctual and helpful with the luggage. Clean car."] },
  { route: "jeddah-makkah", vehicle: "ford-taurus", rev: true, name: "سارة الغامدي", phone: "+966544778899", pax: 4, bags: 4, date: 0, time: "21:30", pickup: "فندق موفنبيك أبراج البيت", flight: null, status: "confirmed", locale: "ar", driver: 2 },
  // earlier trips that customers rated (they fill "what our customers say")
  { route: "jeddah-airport-makkah", vehicle: "toyota-camry", rev: false, name: "خالد المطيري", phone: "+966551010101", pax: 2, bags: 2, date: -6, time: "10:00", pickup: "مطار جدة، الصالة ١", flight: null, status: "completed", locale: "ar", driver: 0, rating: [5, 5, "السائق وصل قبل الموعد وساعدنا في الشنط، والسيارة نظيفة جدًا. شكرًا لكم."] },
  { route: "makkah-madinah", vehicle: "gmc-yukon", rev: false, name: "أم فيصل العنزي", phone: "+966552020202", pax: 6, bags: 5, date: -9, time: "08:00", pickup: "فندق سويس أوتيل مكة", flight: null, status: "completed", locale: "ar", driver: 1, rating: [5, 4, "رحلة مريحة وآمنة، والسائق محترم. أنصح فيهم للعوائل."] },
  { route: "madinah-airport-madinah", vehicle: "hyundai-staria", rev: false, name: "Omar Siddiqui", phone: "+447700900456", pax: 4, bags: 4, date: -12, time: "19:30", pickup: "Madinah Airport arrivals", flight: "SV 1452", status: "completed", locale: "en", driver: 0, rating: [4, 5, "Driver tracked our delayed flight and was waiting with a sign. Great service."] },
  { route: "jeddah-makkah", vehicle: "toyota-camry", rev: false, name: "ريم الزهراني", phone: "+966553030303", pax: 1, bags: 1, date: -15, time: "13:00", pickup: "حي الروضة، جدة", flight: null, status: "completed", locale: "ar", driver: 2, rating: [4, 4, "الحجز سهل والسعر واضح من البداية."] },
  { route: "makkah-ziyarat", vehicle: "toyota-hiace", rev: false, name: "عبدالرحمن السبيعي", phone: "+966554040404", pax: 8, bags: 0, date: -20, time: "06:30", pickup: "فندق هيلتون مكة", flight: null, status: "completed", locale: "ar", driver: 1, rating: [5, 5, "السائق يعرف الأماكن ويشرح عنها، تجربة الزيارة كانت ممتازة."] },
] as const;

const DRIVERS = [
  { name: "خالد العتيبي", phone: "+966551000001", plate: "أ ر ك ٤٥١٢", car: "جي إم سي يوكن", model: "2024", color: "أسود" },
  { name: "سعيد الحربي", phone: "+966551000002", plate: "ب ن د ٧٣٢٠", car: "تويوتا هايس", model: "2023", color: "أبيض" },
  { name: "ماجد القرني", phone: "+966551000003", plate: "ح ط س ١٩٨٦", car: "تويوتا كامري", model: "2025", color: "فضي" },
];

async function main() {
  await sql`delete from payments`;
  await sql`delete from notifications`;
  await sql`delete from ratings`;
  await sql`delete from bookings`;
  await sql`delete from admin_users where role = 'driver'`;
  await sql`delete from drivers`;
  const driverIds: number[] = [];
  for (const d of DRIVERS) {
    const [row] = await sql`insert into drivers (name, phone, plate_number, car_type, car_model, car_color)
      values (${d.name}, ${d.phone}, ${d.plate}, ${d.car}, ${d.model}, ${d.color}) returning id`;
    driverIds.push(row.id);
  }

  for (const [i, b] of demo.entries()) {
    const [t] = await sql`
      select t.id, t.price, v.name_ar, v.name_en, r.title_ar, r.title_en, r.duration_min,
             fa.name_ar fa, fa.name_en fe, ta.name_ar ta, ta.name_en te
      from trips t join vehicles v on v.id = t.vehicle_id join routes r on r.id = t.route_id
      join locations fa on fa.id = r.from_location_id left join locations ta on ta.id = r.to_location_id
      where r.slug = ${b.route} and v.slug = ${b.vehicle}`;
    const ar = b.locale === "ar";
    const [a, z] = b.rev ? [ar ? t.ta : t.te, ar ? t.fa : t.fe] : [ar ? t.fa : t.fe, ar ? t.ta : t.te];
    const title = (ar ? t.title_ar : t.title_en) ?? `${a} ${ar ? "←" : "→"} ${z}`;
    const paid = b.status !== "pending_payment";
    const vat = Math.round(t.price * 0.15);
    const created = new Date(Date.now() - (demo.length - i) * 3.7 * 3600e3);
    // every third booking (and the unpaid one) uses bank transfer, the rest MyFatoorah
    const bank = i % 3 === 1 || !paid;
    const bookingRef = ref();
    const paymentId = paid ? (bank ? `BT-${bookingRef}` : `0707${String(6400100 + i)}${randomBytes(4).toString("hex")}`) : null;

    const [row] = await sql`
      insert into bookings (ref, trip_id, route_title, vehicle_name, reversed, customer_name, customer_phone,
        passengers, bags, pickup_date, pickup_time, pickup_address, flight_number, subtotal, vat_rate, vat_amount, amount, currency, status,
        payment_id, payment_method, duration_min, paid_at, locale, admin_note, created_at, updated_at)
      values (${bookingRef}, ${t.id}, ${title}, ${ar ? t.name_ar : t.name_en}, ${b.rev}, ${b.name}, ${b.phone},
        ${b.pax}, ${b.bags}, ${day(b.date)}, ${b.time}, ${b.pickup}, ${b.flight}, ${t.price}, 1500, ${vat}, ${t.price + vat}, 'SAR', ${b.status},
        ${paymentId}, ${bank ? "bank_transfer" : "myfatoorah"}, ${t.duration_min}, ${paid ? new Date(created.getTime() + 4 * 60e3) : null}, ${b.locale},
        ${"note" in b ? b.note : null}, ${created}, ${created})
      returning id`;
    if ("driver" in b) {
      const done = b.status === "completed";
      await sql`update bookings set driver_id = ${driverIds[b.driver]}, driver_assigned_at = ${created},
        completed_at = ${done ? new Date(Date.now() + b.date * 864e5 + 3 * 3600e3) : null}, rating_requested_at = ${done ? new Date() : null}
        where id = ${row.id}`;
    }
    if ("rating" in b) {
      const [company, driver, comment] = b.rating;
      await sql`insert into ratings (booking_id, driver_id, driver_stars, company_stars, comment, created_at)
        values (${row.id}, ${driverIds[b.driver]}, ${driver}, ${company}, ${comment}, ${new Date(Date.now() + (b.date + 1) * 864e5)})`;
    }
    if (paymentId) {
      await sql`insert into payments (id, booking_id, status, amount, currency, source)
                values (${paymentId}, ${row.id}, 'paid', ${t.price + vat}, 'SAR', ${bank ? "bank_transfer" : "MADA"})`;
    }
  }
  // a driver account to try "my trips": sign in with 0551000001 / Rihla-Driver-2026
  const bcrypt = (await import("bcryptjs")).default;
  await sql`insert into admin_users (email, name, password_hash, role, driver_id)
    values ('+966551000001', ${DRIVERS[0].name}, ${await bcrypt.hash("Rihla-Driver-2026", 10)}, 'driver', ${driverIds[0]})
    on conflict (email) do nothing`;
  console.log(`Inserted ${demo.length} demo bookings, ${DRIVERS.length} drivers (driver sign-in: 0551000001 / Rihla-Driver-2026)`);

  // two sample conversations for the admin inbox: one waiting for staff, one the bot handled
  await sql`delete from chat_conversations`;
  const convo = async (status: string, name: string | null, phone: string | null, unread: number, lines: [string, string][]) => {
    const [c] = await sql`insert into chat_conversations (token_hash, locale, status, customer_name, customer_phone, unread_admin, last_message_at, created_at)
      values (${randomBytes(32).toString("hex")}, 'ar', ${status}, ${name}, ${phone}, ${unread}, now(), now() - interval '20 minutes') returning id`;
    for (const [sender, body] of lines) await sql`insert into chat_messages (conversation_id, sender, body) values (${c.id}, ${sender}, ${body})`;
  };
  await convo("waiting", "سارة الغامدي", "+966544778899", 2, [
    ["customer", "ما سياسة الإلغاء والاسترداد؟"],
    ["bot", "تقدر تلغي من صفحة حجزك قبل موعد الاستلام. يُسترد المبلغ كاملًا إذا ألغيت قبل الموعد بـ٢٤ ساعة أو أكثر، و٥٠٪ إذا ألغيت بعد ذلك. يعود المبلغ لنفس طريقة الدفع."],
    ["system", "وصل طلبك لموظف خدمة العملاء، وبيرد عليك هنا خلال دقائق. خلّ هذه النافذة مفتوحة أو ارجع لها لاحقًا."],
    ["customer", "عندي حجز الليلة وأبغى أأخر الموعد ساعتين، ممكن؟"],
  ]);
  await convo("bot", null, null, 0, [
    ["customer", "هل السعر للسيارة أو للشخص؟"],
    ["bot", "السعر للسيارة كاملة وليس للراكب، ويشمل الوقود ورسوم الطرق. تُضاف ضريبة القيمة المضافة ١٥٪ عند الدفع."],
  ]);
  console.log("Inserted 2 demo conversations");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
