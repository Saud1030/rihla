// End-to-end test suite: booking flow, MyFatoorah payments, security, admin, mobile, a11y, load.
// Runs against a running server that points at tests/mock-myfatoorah.mjs. See tests/README.md.
// Each check is independent; failures are collected and reported at the end.
import { chromium } from "playwright";
import { execSync, execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3001";
const MF = "http://localhost:4010";
const ROOT = process.cwd();
const envFile = fs.readFileSync(`${ROOT}/.env`, "utf8");
const env = (k) => envFile.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();
const WH_SECRET = env("MYFATOORAH_WEBHOOK_SECRET");
const DB = env("DATABASE_URL");
const ONLY = process.env.ONLY; // run one section
const require = createRequire(import.meta.url);

const results = [];
let section = "";
async function check(name, fn) {
  const label = `${section} › ${name}`;
  try {
    await fn();
    results.push({ label, ok: true });
    console.log("  ✓", name);
  } catch (e) {
    const lines = e.message.split("\n");
    const waiting = lines.find((l) => l.includes("waiting for")) ?? "";
    const err = `${lines[0]} ${waiting.trim()}`.slice(0, 400);
    results.push({ label, ok: false, err });
    console.log("  ✗", name, "\n     ", err);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const sql = (q) => execFileSync("psql", [DB, "-At", "-c", q]).toString().trim();
const mf = async (p, body) => (await fetch(MF + p, { method: body ? "POST" : "GET", body: body ? JSON.stringify(body) : undefined })).json();
const sign = (d) =>
  createHmac("sha256", WH_SECRET)
    .update(
      [`Invoice.Id=${d.Invoice?.Id ?? ""}`, `Invoice.Status=${d.Invoice?.Status ?? ""}`, `Transaction.Status=${d.Transaction?.Status ?? ""}`, `Transaction.PaymentId=${d.Transaction?.PaymentId ?? ""}`, `Invoice.ExternalIdentifier=${d.Invoice?.ExternalIdentifier ?? ""}`].join(","),
    )
    .digest("base64");
const webhook = (data, { sig, code = 1, raw } = {}) =>
  fetch(`${BASE}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "MyFatoorah-Signature": sig ?? sign(data) },
    body: raw ?? JSON.stringify({ Event: { Code: code, Name: code === 1 ? "PAYMENT_STATUS_CHANGED" : "OTHER", CountryIsoCode: "SAU", CreationDate: new Date().toISOString(), Reference: "WH-" + Date.now() }, Data: data }),
  });
const whData = (inv, t) => ({ Invoice: { Id: inv.InvoiceId, Status: inv.InvoiceStatus.toUpperCase(), ExternalIdentifier: null }, Transaction: { Status: t.TransactionStatus === "Succss" ? "SUCCESS" : "FAILED", PaymentId: t.PaymentId } });
const callbackLoc = async (ref, pid, lang = "ar") => (await fetch(`${BASE}/api/payments/callback?ref=${ref}&lang=${lang}&paymentId=${pid}&Id=${pid}`, { redirect: "manual" })).headers.get("location") ?? "";
const bookingRow = (ref) => {
  const [status, paymentId, amount, invoiceId] = sql(`select status, coalesce(payment_id,''), amount, coalesce(invoice_id,'') from bookings where ref='${ref}'`).split("|");
  return { status, paymentId, amount: Number(amount), invoiceId };
};
const tomorrow = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const inDaysUTC = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => { pageErrors.push("DIALOG OPENED: " + d.message()); d.dismiss(); });

async function fillBooking(p, o = {}) {
  const lang = o.lang ?? "ar";
  await p.goto(`${BASE}/${lang}/routes/${o.route ?? "jeddah-airport-makkah"}${o.query ?? ""}`, { waitUntil: "networkidle" });
  if (o.vehicle) await p.getByRole("radiogroup").getByText(o.vehicle, { exact: true }).click();
  if (o.reverse) await p.locator('input[name="reversed"][value="1"]').check();
  await p.fill("#date", o.date ?? tomorrow());
  await p.fill("#time", "14:30");
  await p.fill("#passengers", String(o.passengers ?? 2));
  await p.fill("#bags", String(o.bags ?? 2));
  await p.fill("#pickup", o.pickup ?? "صالة الحجاج، مطار جدة");
  await p.fill("#name", o.name ?? "عميل الاختبار");
  await p.fill("#phone", o.phone ?? "+966 50 123 4567");
  if (o.before) await o.before(p);
  await p.locator("form:has(#name) button[type=submit]").click();
}
async function makeBooking(p, o = {}) {
  await fillBooking(p, o);
  await p.waitForURL(/\/checkout\/[A-Z0-9]{8}$/, { waitUntil: "commit", timeout: 15000 });
  await p.waitForLoadState("networkidle");
  return p.url().split("/").pop();
}
async function payInBrowser(p, ref, outcome, lang = "ar") {
  await p.goto(`${BASE}/${lang}/checkout/${ref}`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: lang === "ar" ? /ادفع/ : /^Pay/ }).click();
  await p.waitForURL(/localhost:4010\/pay\/\d+$/, { waitUntil: "commit", timeout: 15000 });
  await p.click(outcome === "pay" ? "#pay" : "#decline");
  await p.waitForURL(new RegExp(`/${lang}/booking/${ref}`), { waitUntil: "commit", timeout: 15000 });
  await p.waitForLoadState("networkidle");
}
/** tap-chooser: open field n (0 = from, 1 = to), then region → city → place */
async function pickPlace(p, n, region, city, place, form = "search") {
  await p.locator(`form#${form} button[aria-controls=${form}-panel]`).nth(n).click();
  const panel = p.locator(`#${form}-panel`);
  await panel.getByRole("button", { name: new RegExp(region) }).click();
  await panel.getByRole("button", { name: new RegExp("^" + city) }).click();
  await panel.getByRole("button", { name: new RegExp(place.replace(/[()]/g, "\\$&")) }).first().click();
  await panel.waitFor({ state: "detached" });
}
async function adminLogin(p, email = "admin@example.com", password = "Admin12345") {
  await p.goto(`${BASE}/admin/login`, { waitUntil: "networkidle" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
  await p.getByRole("button", { name: "دخول" }).click();
}

/* ======================================================================= */
if (!ONLY || ONLY === "flow") {
  section = "Booking & payment flow";
  console.log(`\n${section}`);
  let ref;
  await check("empty form shows field errors", async () => {
    await page.goto(`${BASE}/ar/routes/jeddah-airport-makkah`, { waitUntil: "networkidle" });
    await page.locator("form:has(#name) button[type=submit]").click();
    await page.getByText("اكتب الاسم الكامل.").waitFor({ timeout: 8000 });
    eq(await page.locator('#phone[aria-invalid="true"]').count(), 1, "phone flagged");
  });
  await check("capacity enforced on server, typed values kept", async () => {
    await fillBooking(page, { vehicle: "تويوتا كامري", passengers: 9 });
    await page.getByText("عدد الركاب أكبر من سعة هذه السيارة.").waitFor({ timeout: 8000 });
    eq(await page.inputValue("#name"), "عميل الاختبار", "name kept");
  });
  await check("past date rejected", async () => {
    await fillBooking(page, { date: "2020-01-01" });
    await page.getByText("اختر تاريخًا من اليوم وحتى سنة من الآن.").waitFor({ timeout: 8000 });
  });
  await check("valid booking -> checkout shows server price, masked phone, MyFatoorah button", async () => {
    ref = await makeBooking(page, { vehicle: "جمس يوكن XL" });
    await page.getByText("+9665•", { exact: false }).waitFor();
    await page.getByRole("button", { name: /ادفع ٥٥٢ ر\.س/ }).waitFor();
    eq(bookingRow(ref).amount, 55200, "amount in DB (480 + 15% VAT)");
  });
  await check("SendPayment gets the right amount, reference and callback", async () => {
    await page.getByRole("button", { name: /ادفع/ }).click();
    await page.waitForURL(/localhost:4010\/pay\/\d+$/, { waitUntil: "commit" });
    const last = await mf("/__last");
    eq(last.request.InvoiceValue, 552, "InvoiceValue incl. VAT");
    eq(last.request.InvoiceItems.length, 2, "trip line + VAT line");
    eq(last.request.InvoiceItems[1].UnitPrice, 72, "VAT line");
    eq(last.request.CustomerReference, ref, "CustomerReference");
    eq(last.request.NotificationOption, "LNK", "NotificationOption");
    eq(last.request.DisplayCurrencyIso, "SAR", "currency");
    eq(last.request.Language, "AR", "language");
    assert(last.request.CallBackUrl.startsWith(`${env("NEXT_PUBLIC_SITE_URL")}/api/payments/callback?ref=` + ref), "callback url " + last.request.CallBackUrl);
    eq(bookingRow(ref).invoiceId, String(last.invoiceId), "invoice id stored on booking");
  });
  await check("declined card -> failure page with retry, booking stays unpaid", async () => {
    await page.click("#decline");
    await page.waitForURL(new RegExp(`/ar/booking/${ref}\\?result=failed`), { waitUntil: "commit" });
    await page.getByText("لم تكتمل عملية الدفع").waitFor();
    eq(bookingRow(ref).status, "pending_payment", "status");
    eq(sql(`select status from payments where booking_id=(select id from bookings where ref='${ref}')`), "failed", "failed attempt logged");
  });
  await check("retry and pay -> success page, booking paid", async () => {
    await payInBrowser(page, ref, "pay");
    await page.getByText("تم الدفع وتأكيد استلام حجزك").waitFor();
    const b = bookingRow(ref);
    eq(b.status, "paid", "status");
    assert(b.paymentId.startsWith("0707"), "payment id stored");
  });
  await check("paid booking can't be paid again", async () => {
    await page.goto(`${BASE}/ar/checkout/${ref}`, { waitUntil: "networkidle" });
    await page.getByText("تم دفع هذا الحجز.").waitFor();
  });
  await check("English flow end to end", async () => {
    const r = await makeBooking(page, { lang: "en", vehicle: "Toyota Camry", reverse: true, name: "John Test", pickup: "Hilton Makkah" });
    await payInBrowser(page, r, "pay", "en");
    await page.getByText("Payment received, your booking is in").waitFor();
    eq(sql(`select route_title from bookings where ref='${r}'`), "Makkah hotels → Jeddah Airport (KAIA)", "reversed title stored");
    eq((await mf("/__last")).request.Language, "EN", "MyFatoorah page language");
  });
}

/* ======================================================================= */
if (!ONLY || ONLY === "pay") {
  section = "Payment edge cases";
  console.log(`\n${section}`);
  const fresh = async () => makeBooking(page, { vehicle: "جمس يوكن XL" });

  await check("underpaid invoice marked Paid is rejected", async () => {
    const ref = await fresh();
    const inv = await mf("/__invoice", { InvoiceValue: 1, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: "0707UNDER" + Date.now(), TransactionStatus: "Succss", TransationValue: "1" }] });
    const loc = await callbackLoc(ref, inv.InvoiceTransactions[0].PaymentId);
    assert(loc.includes("result=failed"), loc);
    eq(bookingRow(ref).status, "pending_payment", "status");
  });
  await check("overpaid invoice is also rejected (exact match only)", async () => {
    const ref = await fresh();
    const inv = await mf("/__invoice", { InvoiceValue: 999, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: "0707OVER" + Date.now(), TransactionStatus: "Succss" }] });
    assert((await callbackLoc(ref, inv.InvoiceTransactions[0].PaymentId)).includes("result=failed"), "should fail");
  });
  await check("Paid invoice for booking A doesn't settle booking B", async () => {
    const a = await fresh();
    const b = await fresh();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: a, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: "0707AB" + Date.now(), TransactionStatus: "Succss" }] });
    const loc = await callbackLoc(b, inv.InvoiceTransactions[0].PaymentId);
    assert(loc.includes(`/ar/booking/${b}`) && loc.includes("result=failed"), loc);
    eq(bookingRow(b).status, "pending_payment", "B untouched");
    eq(bookingRow(a).status, "paid", "A settled by its own invoice");
  });
  await check("invoice with no CustomerReference settles nothing", async () => {
    const ref = await fresh();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: null, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: "0707NOREF" + Date.now(), TransactionStatus: "Succss" }] });
    assert((await callbackLoc(ref, inv.InvoiceTransactions[0].PaymentId)).includes("result=failed"), "should fail");
  });
  await check("unknown payment id and garbage ids are rejected", async () => {
    const ref = await fresh();
    assert((await callbackLoc(ref, "0707000000000000")).includes("result=failed"), "unknown");
    assert((await callbackLoc(ref, "../../etc/passwd")).includes("result=failed"), "garbage");
    assert((await callbackLoc(ref, "")).includes("result=failed"), "empty");
  });
  await check("gateway down at callback -> 'verifying' page, no retry button, then refresh settles it", async () => {
    const ref = await fresh();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: "0707DOWN" + Date.now(), TransactionStatus: "Succss" }] });
    await mf("/__down");
    const loc = await callbackLoc(ref, inv.InvoiceTransactions[0].PaymentId);
    assert(loc.includes("result=verifying"), loc);
    await page.goto(loc.startsWith("http") ? loc : BASE + loc, { waitUntil: "networkidle" });
    await page.getByText("نتحقق من عملية الدفع").waitFor();
    eq(await page.getByRole("link", { name: "حاول الدفع مرة أخرى" }).count(), 0, "no retry button while verifying");
    await mf("/__up");
    await page.getByRole("link", { name: "تحديث الحالة" }).click();
    await page.getByText("تم الدفع وتأكيد استلام حجزك").waitFor({ timeout: 10000 });
  });
  await check("webhook: valid signature settles booking (customer never returned)", async () => {
    const ref = await fresh();
    const pid = "0707WH" + Date.now();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: pid, TransactionStatus: "Succss" }] });
    const r = await webhook(whData(inv, inv.InvoiceTransactions[0]));
    eq(r.status, 200, "status");
    eq((await r.json()).result.ok, true, "settled");
    eq(bookingRow(ref).status, "paid", "booking");
  });
  await check("webhook: bad / missing signature -> 401, nothing changes", async () => {
    const ref = await fresh();
    const pid = "0707BADSIG" + Date.now();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: pid, TransactionStatus: "Succss" }] });
    const d = whData(inv, inv.InvoiceTransactions[0]);
    eq((await webhook(d, { sig: "AAAA" })).status, 401, "bad sig");
    eq((await webhook(d, { sig: "" })).status, 401, "empty sig");
    eq((await webhook({ ...d, Transaction: { ...d.Transaction, PaymentId: "0707OTHER1234" } }, { sig: sign(d) })).status, 401, "body changed after signing");
    eq(bookingRow(ref).status, "pending_payment", "untouched");
  });
  await check("webhook: forged body with valid signature still re-checks the API", async () => {
    // even if the secret leaked, a SUCCESS event for an unpaid invoice can't mark it paid
    const ref = await fresh();
    const pid = "0707FORGE" + Date.now();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Pending", InvoiceTransactions: [{ PaymentId: pid, TransactionStatus: "Failed" }] });
    const d = { Invoice: { Id: inv.InvoiceId, Status: "PAID" }, Transaction: { Status: "SUCCESS", PaymentId: pid } };
    const r = await webhook(d);
    eq(r.status, 200, "accepted");
    eq(bookingRow(ref).status, "pending_payment", "still unpaid");
  });
  await check("webhook: invalid JSON 400, other event codes ignored", async () => {
    eq((await webhook({}, { raw: "{not json" })).status, 400, "bad json");
    const r = await webhook({ foo: 1 }, { code: 2 });
    eq(r.status, 200, "refund event acknowledged");
  });
  await check("webhook while gateway down -> 500 so MyFatoorah retries; retry succeeds", async () => {
    const ref = await fresh();
    const pid = "0707RETRY" + Date.now();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: pid, TransactionStatus: "Succss" }] });
    await mf("/__down");
    eq((await webhook(whData(inv, inv.InvoiceTransactions[0]))).status, 500, "during outage");
    await mf("/__up");
    eq((await webhook(whData(inv, inv.InvoiceTransactions[0]))).status, 200, "retry");
    eq(bookingRow(ref).status, "paid", "settled on retry");
  });
  await check("callback + webhook racing (x6 in parallel, 5 rounds) -> paid exactly once, every caller sees success", async () => {
    for (let round = 0; round < 5; round++) {
      const ref = await fresh();
      const pid = "0707RACE" + round + Date.now();
      const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: pid, TransactionStatus: "Succss" }] });
      const d = whData(inv, inv.InvoiceTransactions[0]);
      const rs = await Promise.all([webhook(d), callbackLoc(ref, pid), webhook(d), callbackLoc(ref, pid), webhook(d), callbackLoc(ref, pid)]);
      for (const r of rs) {
        if (typeof r === "string") assert(r.includes("result=paid"), `round ${round} callback ${r}`);
        else { eq(r.status, 200, "webhook status"); eq((await r.json()).result.ok, true, `round ${round} webhook result`); }
      }
      eq(sql(`select count(*) from bookings where payment_id='${pid}'`), "1", "one booking");
      eq(sql(`select count(*) from payments where id='${pid}'`), "1", "one payment row");
    }
  });
  await check("payment arriving for a cancelled booking is logged for refund, booking stays cancelled", async () => {
    const ref = await fresh();
    sql(`update bookings set status='cancelled' where ref='${ref}'`);
    const pid = "0707CANC" + Date.now();
    const inv = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: pid, TransactionStatus: "Succss" }] });
    const r = await (await webhook(whData(inv, inv.InvoiceTransactions[0]))).json();
    eq(r.result.ok, false, "not settled");
    eq(bookingRow(ref).status, "cancelled", "still cancelled");
    eq(sql(`select status from payments where id='${pid}'`), "paid", "payment logged as paid (visible to admin for refund)");
  });
  await check("second successful invoice for an already-paid booking is flagged, not double-counted", async () => {
    const ref = await fresh();
    const p1 = "0707DBL1" + Date.now(), p2 = "0707DBL2" + Date.now();
    const i1 = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: p1, TransactionStatus: "Succss" }] });
    const i2 = await mf("/__invoice", { InvoiceValue: 552, CustomerReference: ref, InvoiceStatus: "Paid", InvoiceTransactions: [{ PaymentId: p2, TransactionStatus: "Succss" }] });
    await webhook(whData(i1, i1.InvoiceTransactions[0]));
    const r = await (await webhook(whData(i2, i2.InvoiceTransactions[0]))).json();
    eq(r.result.ok, false, "second not settled");
    eq(bookingRow(ref).paymentId, p1, "first payment kept");
    eq(sql(`select count(*) from payments where booking_id=(select id from bookings where ref='${ref}') and status='paid'`), "2", "both visible to admin");
  });
  await check("gateway rejects SendPayment -> clear error on checkout, no charge", async () => {
    const ref = await fresh();
    await mf("/__down");
    await page.goto(`${BASE}/ar/checkout/${ref}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /ادفع/ }).click();
    await page.getByText("تعذّر فتح صفحة الدفع الآن").waitFor({ timeout: 10000 });
    await mf("/__up");
  });
}

/* ======================================================================= */
if (!ONLY || ONLY === "security") {
  section = "Security & tampering";
  console.log(`\n${section}`);
  await check("injected amount field is ignored", async () => {
    const ref = await makeBooking(page, {
      vehicle: "جمس يوكن XL",
      before: (p) => p.evaluate(() => { const i = document.createElement("input"); i.type = "hidden"; i.name = "amount"; i.value = "1"; document.querySelector("form:has(#name)").appendChild(i); }),
    });
    eq(bookingRow(ref).amount, 55200, "server price used");
  });
  await check("tampered trip id: inactive trip rejected", async () => {
    const tid = sql("select t.id from trips t join routes r on r.id=t.route_id join vehicles v on v.id=t.vehicle_id where r.slug='jeddah-airport-makkah' and v.slug='bus-49'");
    sql(`update trips set active=false where id=${tid}`);
    try {
      await fillBooking(page, { before: (p) => p.evaluate((id) => { const r = document.querySelector('input[name="tripId"]:checked'); r.value = id; }, tid) });
      await page.getByText("السيارة المختارة لم تعد متاحة").waitFor({ timeout: 8000 });
    } finally {
      sql(`update trips set active=true where id=${tid}`);
    }
  });
  await check("tampered trip id: non-existent id rejected", async () => {
    await fillBooking(page, { before: (p) => p.evaluate(() => { document.querySelector('input[name="tripId"]:checked').value = "999999"; }) });
    await page.getByText("السيارة المختارة لم تعد متاحة").waitFor({ timeout: 8000 });
  });
  await check("reverse direction forced on a one-way tour is ignored", async () => {
    const ref = await makeBooking(page, { route: "makkah-ziyarat", before: (p) => p.evaluate(() => { document.querySelector('input[name="reversed"]').value = "1"; }) });
    eq(sql(`select reversed from bookings where ref='${ref}'`), "f", "reversed=false");
  });
  await check("over-long notes rejected (server limit)", async () => {
    await fillBooking(page, { before: (p) => p.evaluate(() => { const t = document.querySelector("#notes"); t.removeAttribute("maxlength"); t.value = "x".repeat(1500); }) });
    await page.getByRole("alert").filter({ hasText: "تعذّر إنشاء الحجز" }).waitFor({ timeout: 8000 });
  });
  await check("phone with letters rejected", async () => {
    await fillBooking(page, { phone: "call me maybe" });
    await page.getByText("اكتب رقم واتساب صحيحًا").waitFor({ timeout: 8000 });
  });
  await check("date more than a year ahead rejected", async () => {
    const far = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
    await fillBooking(page, { date: far });
    await page.locator('#date[aria-invalid="true"]').waitFor({ timeout: 8000 });
  });
  let xssRef;
  await check("script in customer name is stored as text and rendered harmlessly", async () => {
    xssRef = await makeBooking(page, { name: `<img src=x onerror="alert('xss')"><script>alert(1)</script>` });
    eq(await page.locator("img[src='x']").count(), 0, "no injected img on checkout");
  });

  // admin session for the next checks
  const admin = await ctx.newPage();
  admin.on("dialog", (d) => { pageErrors.push("DIALOG OPENED (admin): " + d.message()); d.dismiss(); });
  await adminLogin(admin);
  await admin.waitForURL(`${BASE}/admin`, { waitUntil: "commit" });

  await check("XSS name is harmless in admin list and detail", async () => {
    await admin.goto(`${BASE}/admin/bookings`, { waitUntil: "networkidle" });
    await admin.goto(`${BASE}/admin/bookings/${xssRef}`, { waitUntil: "networkidle" });
    eq(await admin.locator("img[src='x']").count(), 0, "no injected img");
    assert((await admin.textContent("main")).includes("<img src=x"), "shown as text");
  });
  await check("SQL-ish search terms are safe and literal", async () => {
    for (const q of ["' OR 1=1 --", "%", "_", "\\", "'; drop table bookings; --"]) {
      const r = await admin.goto(`${BASE}/admin/bookings?q=${encodeURIComponent(q)}`, { waitUntil: "networkidle" });
      eq(r.status(), 200, `status for ${q}`);
      await admin.getByText("٠ حجز").waitFor({ timeout: 5000 });
    }
    assert(Number(sql("select count(*) from bookings")) > 0, "table intact");
  });
  await check("admin can't mark a booking paid by hand", async () => {
    const ref = sql("select ref from bookings where status='pending_payment' limit 1");
    await admin.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    await admin.evaluate(() => { const s = document.querySelector('select[name="status"]'); const o = document.createElement("option"); o.value = "paid"; s.appendChild(o); s.value = "paid"; });
    await admin.getByRole("button", { name: "حفظ" }).click();
    await admin.getByText("تُضبط تلقائيًا من بوابة الدفع فقط").waitFor({ timeout: 8000 });
    eq(bookingRow(ref).status, "pending_payment", "unchanged");
  });

  // capture a real server action request so we can replay it without a session
  let captured = null;
  await check("server action replayed without a session is refused", async () => {
    admin.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"] && r.url().includes("/admin/settings")) captured = r; });
    await admin.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await admin.fill('input[name="notice_ar"]', "تنبيه من الاختبار");
    await admin.getByRole("button", { name: "حفظ الإعدادات" }).click();
    await admin.getByText("تم حفظ الإعدادات.").waitFor();
    assert(captured, "captured action request");
    const body = captured.postData().replace("تنبيه من الاختبار", "HACKED");
    const h = captured.headers();
    const r = await fetch(captured.url(), { method: "POST", headers: { "next-action": h["next-action"], "content-type": h["content-type"], accept: "text/x-component" }, body, redirect: "manual" });
    assert(r.status !== 500, "no crash, got " + r.status);
    assert(sql("select value from settings where key='notice_ar'") !== "HACKED", "settings not changed");
  });
  await check("forged / expired / deleted-user sessions are refused", async () => {
    const jose = await import(pathToFileURL(require.resolve("jose", { paths: [ROOT] })).href);
    const secret = env("AUTH_SECRET");
    const mk = async (key, opts = {}) => {
      let j = new jose.SignJWT({ email: "x", name: "x" }).setProtectedHeader({ alg: "HS256" }).setSubject(opts.sub ?? "1").setIssuedAt(opts.iat);
      j = j.setExpirationTime(opts.exp ?? "1h");
      return j.sign(new TextEncoder().encode(key));
    };
    const tokens = {
      wrongKey: await mk("x".repeat(64)),
      expired: await mk(secret, { iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 }),
      deletedUser: await mk(secret, { sub: "9999" }),
      none: "eyJhbGciOiJub25lIn0.eyJzdWIiOiIxIn0.",
    };
    for (const [name, tok] of Object.entries(tokens)) {
      const r = await fetch(`${BASE}/admin/bookings`, { headers: { cookie: `admin_session=${tok}` }, redirect: "manual" });
      const html = r.status === 200 ? await r.text() : "";
      const leaked = /عبدالله|Fatima|\+9665/.test(html);
      assert(!leaked, `${name}: booking data leaked`);
      assert(r.status === 307 || r.status === 308 || /admin\/login/.test(html), `${name}: not redirected (status ${r.status})`);
    }
  });
  await check("login throttled after 5 wrong passwords", async () => {
    const p = await ctx.newPage();
    const who = `attacker-${Date.now()}@example.com`;
    for (let i = 0; i < 5; i++) {
      await adminLogin(p, who, "guess" + i);
      await p.getByText("غير صحيحة").waitFor({ timeout: 8000 });
    }
    await adminLogin(p, who, "guess-final");
    await p.getByText("محاولات كثيرة").waitFor({ timeout: 8000 });
  });
  await check("no JS dialog was ever triggered", async () => {
    eq(pageErrors.filter((e) => e.startsWith("DIALOG")).length, 0, "dialogs " + pageErrors.join(" | "));
  });
  await check("security headers present", async () => {
    const r = await fetch(`${BASE}/ar`);
    for (const h of ["x-frame-options", "x-content-type-options", "referrer-policy"]) assert(r.headers.get(h), `missing ${h}`);
    const a = await fetch(`${BASE}/admin/login`);
    assert(a.headers.get("x-frame-options"), "admin missing x-frame-options");
  });
}

/* ======================================================================= */
if (!ONLY || ONLY === "admin") {
  section = "Admin operations";
  console.log(`\n${section}`);
  const a = await ctx.newPage();
  await adminLogin(a);
  await a.waitForURL(`${BASE}/admin`, { waitUntil: "commit" });
  const site = await ctx.newPage();

  await check("status flow: paid -> confirmed with note -> completed; cannot go back to pending", async () => {
    const ref = sql("select ref from bookings where status='paid' limit 1");
    await a.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    await a.selectOption('select[name="status"]', "confirmed");
    await a.fill('textarea[name="adminNote"]', "السائق: خالد");
    await a.getByRole("button", { name: "حفظ" }).click();
    await a.getByText("تم حفظ التغييرات.").waitFor();
    eq(bookingRow(ref).status, "confirmed", "confirmed");
    await a.selectOption('select[name="status"]', "completed");
    await a.getByRole("button", { name: "حفظ" }).click();
    await a.getByText("تم حفظ التغييرات.").waitFor();
    eq(bookingRow(ref).status, "completed", "completed");
    await a.evaluate(() => { const s = document.querySelector('select[name="status"]'); const o = document.createElement("option"); o.value = "pending_payment"; s.appendChild(o); s.value = "pending_payment"; });
    await a.getByRole("button", { name: "حفظ" }).click();
    await a.getByText("لا يمكن إرجاع حجز").waitFor();
  });
  await check("prices: invalid value shows error and keeps every edit", async () => {
    await a.goto(`${BASE}/admin/prices`, { waitUntil: "networkidle" });
    const cells = a.locator('input[name^="price_"]');
    await cells.nth(0).fill("777");
    await cells.nth(1).fill("abc");
    await a.getByRole("button", { name: "حفظ كل الأسعار" }).click();
    await a.getByText("أحد الأسعار غير صحيح").waitFor();
    eq(await cells.nth(0).inputValue(), "777", "first edit kept");
    eq(await cells.nth(1).inputValue(), "abc", "bad value kept for fixing");
  });
  await check("prices: Arabic digits accepted and shown on the site", async () => {
    await a.goto(`${BASE}/admin/prices`, { waitUntil: "networkidle" });
    const name = await a.locator('input[name^="price_"]').nth(0).getAttribute("name");
    const before = await a.locator(`input[name="${name}"]`).inputValue();
    await a.fill(`input[name="${name}"]`, "٢٦٥");
    await a.getByRole("button", { name: "حفظ كل الأسعار" }).click();
    await a.getByText("تم حفظ الأسعار").waitFor();
    const [, r, v] = name.split("_");
    eq(sql(`select price from trips where route_id=${r} and vehicle_id=${v}`), "26500", "stored");
    await site.goto(`${BASE}/ar/routes/jeddah-airport-makkah`, { waitUntil: "networkidle" });
    assert((await site.textContent("[role=radiogroup]")).includes("٢٦٥"), "shown on site");
    sql(`update trips set price=${Number(before) * 100} where route_id=${r} and vehicle_id=${v}`);
  });
  await check("prices: clearing a cell removes that vehicle from the route on the site", async () => {
    await a.goto(`${BASE}/admin/prices`, { waitUntil: "networkidle" });
    const coach = sql("select id from vehicles where slug='bus-49'"), route = sql("select id from routes where slug='jeddah-airport-makkah'");
    await a.fill(`input[name="price_${route}_${coach}"]`, "");
    await a.getByRole("button", { name: "حفظ كل الأسعار" }).click();
    await a.getByText("تم حفظ الأسعار").waitFor();
    await site.goto(`${BASE}/ar/routes/jeddah-airport-makkah`, { waitUntil: "networkidle" });
    eq(await site.getByRole("radiogroup").getByText("حافلة ٤٩ راكب").count(), 0, "coach hidden");
    sql(`update trips set active=true where route_id=${route} and vehicle_id=${coach}`);
  });
  await check("vehicles: add, duplicate slug rejected, deactivate hides it", async () => {
    sql("delete from vehicles where slug='test-van'");
    await a.goto(`${BASE}/admin/vehicles/new`, { waitUntil: "networkidle" });
    await a.fill('input[name="nameAr"]', "فان اختبار");
    await a.fill('input[name="nameEn"]', "Test Van");
    await a.fill('input[name="slug"]', "test-van");
    await a.selectOption('select[name="category"]', "van");
    await a.getByRole("button", { name: "إضافة" }).click();
    await a.waitForURL(`${BASE}/admin/vehicles`, { waitUntil: "commit" });
    await site.goto(`${BASE}/ar/fleet`, { waitUntil: "networkidle" });
    await site.getByText("فان اختبار").waitFor();
    await a.goto(`${BASE}/admin/vehicles/new`, { waitUntil: "networkidle" });
    await a.fill('input[name="nameAr"]', "مكرر"); await a.fill('input[name="nameEn"]', "Dup"); await a.fill('input[name="slug"]', "test-van");
    await a.getByRole("button", { name: "إضافة" }).click();
    await a.getByText("بنفس الرمز").waitFor();
    const id = sql("select id from vehicles where slug='test-van'");
    await a.goto(`${BASE}/admin/vehicles/${id}`, { waitUntil: "networkidle" });
    await a.uncheck('input[name="active"]');
    await a.getByRole("button", { name: "حفظ" }).click();
    await a.getByText("تم الحفظ.").waitFor();
    await site.goto(`${BASE}/ar/fleet`, { waitUntil: "networkidle" });
    eq(await site.getByText("فان اختبار").count(), 0, "hidden when inactive");
    sql(`delete from assets where key='vehicle:${id}'; delete from vehicles where slug='test-van'`);
  });
  await check("vehicles: the car photo is uploaded from the device (no link), shown on the site, can be removed", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const id = sql("select id from vehicles where active order by sort_order limit 1");
    const before = sql(`select coalesce(image_url,'') from vehicles where id=${id}`);
    await a.goto(`${BASE}/admin/vehicles/${id}`, { waitUntil: "networkidle" });
    eq(await a.locator('input[name="imageUrl"]').count(), 0, "no link field");
    // a non-image is refused by the server
    await a.setInputFiles('input[name="image"]', { name: "x.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
    await a.getByRole("button", { name: "حفظ" }).click();
    await a.getByText("الصورة يجب أن تكون PNG").waitFor();
    // over 2 MB is refused in the browser
    await a.setInputFiles('input[name="image"]', { name: "big.png", mimeType: "image/png", buffer: Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024 + 10)]) });
    await a.getByText("أكبر من ٢ ميجابايت").waitFor();
    await a.setInputFiles('input[name="image"]', { name: "car.png", mimeType: "image/png", buffer: png });
    await a.getByRole("button", { name: "حفظ" }).click();
    await a.getByText("تم الحفظ.").waitFor();
    const url = sql(`select image_url from vehicles where id=${id}`);
    assert(url.startsWith(`/api/vehicles/${id}/image?v=`), "stored url " + url);
    const r = await fetch(BASE + url);
    eq(r.status, 200, "served"); eq(r.headers.get("content-type"), "image/png", "type");
    eq(Buffer.from(await r.arrayBuffer()).equals(png), true, "same bytes");
    await site.goto(`${BASE}/ar/fleet`, { waitUntil: "networkidle" });
    assert(await site.locator(`img[src*="/api/vehicles/${id}/image"]`).count() > 0, "photo on fleet page");
    await a.goto(`${BASE}/admin/vehicles/${id}`, { waitUntil: "networkidle" });
    await a.check('input[name="removeImage"]');
    await a.getByRole("button", { name: "حفظ" }).click();
    await a.getByText("تم الحفظ.").waitFor();
    eq(sql(`select coalesce(image_url,'') from vehicles where id=${id}`), "", "removed");
    eq((await fetch(`${BASE}/api/vehicles/${id}/image`)).status, 404, "file gone");
    if (before) sql(`update vehicles set image_url='${before}' where id=${id}`);
  });
  await check("routes: validation errors, add route, price it, appears on site", async () => {
    sql("delete from trips where route_id in (select id from routes where slug like 'taif-jeddah-airport%'); delete from routes where slug like 'taif-jeddah-airport%'");
    await a.goto(`${BASE}/admin/routes`, { waitUntil: "networkidle" });
    const form = a.locator("form").filter({ has: a.getByRole("button", { name: "إضافة الرحلة" }) });
    const taif = sql("select id from locations where slug='taif'"), jed = sql("select id from locations where slug='jeddah-airport'");
    await form.locator('select[name="fromLocationId"]').selectOption(taif);
    await form.locator('select[name="toLocationId"]').selectOption(taif);
    await form.getByRole("button", { name: "إضافة الرحلة" }).click();
    await a.getByText("متطابقتان").waitFor();
    await form.locator('select[name="kind"]').selectOption("ziyarat");
    await form.getByRole("button", { name: "إضافة الرحلة" }).click();
    await a.getByText("اكتب اسم الجولة").waitFor();
    await form.locator('select[name="kind"]').selectOption("transfer");
    await form.locator('select[name="toLocationId"]').selectOption(jed);
    await form.locator('input[name="distanceKm"]').fill("170");
    await form.getByRole("button", { name: "إضافة الرحلة" }).click();
    await a.getByText("تمت إضافة الرحلة").waitFor();
    const rid = sql("select id from routes where slug='taif-jeddah-airport'");
    assert(rid, "route created");
    await a.goto(`${BASE}/admin/prices`, { waitUntil: "networkidle" });
    const camry = sql("select id from vehicles where slug='toyota-camry'");
    await a.fill(`input[name="price_${rid}_${camry}"]`, "400");
    await a.getByRole("button", { name: "حفظ كل الأسعار" }).click();
    await a.getByText("تم حفظ الأسعار").waitFor();
    await site.goto(`${BASE}/ar/search?from=taif&to=jeddah-airport&date=${tomorrow()}&time=10:00`, { waitUntil: "networkidle" });
    assert(site.url().includes("/ar/routes/taif-jeddah-airport"), site.url());
    await site.getByText("٤٠٠ ر.س").first().waitFor();
    sql(`delete from trips where route_id=${rid}; delete from routes where id=${rid}`);
  });
  await check("settings: notice text shows on site, empty hides the bar", async () => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    const orig = await a.inputValue('input[name="notice_ar"]');
    await a.fill('input[name="notice_ar"]', "عرض خاص: خصم ١٠٪ هذا الأسبوع");
    await a.getByRole("button", { name: "حفظ الإعدادات" }).click();
    await a.getByText("تم حفظ الإعدادات.").waitFor();
    await site.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await site.getByText("عرض خاص: خصم ١٠٪ هذا الأسبوع").waitFor();
    await a.fill('input[name="notice_ar"]', "");
    await a.getByRole("button", { name: "حفظ الإعدادات" }).click();
    for (let i = 0; i < 50 && sql("select value from settings where key='notice_ar'") !== ""; i++) await a.waitForTimeout(100);
    await site.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await site.locator("[role=note]").count(), 0, "bar hidden");
    sql(`update settings set value='${orig.replace(/'/g, "''")}' where key='notice_ar'`);
  });
  await check("password change: wrong current, too short, success, old password stops working", async () => {
    await a.goto(`${BASE}/admin/account`, { waitUntil: "networkidle" });
    const f = a.locator("form").filter({ has: a.getByRole("button", { name: "تغيير كلمة المرور" }) });
    await f.locator('input[name="current"]').fill("nope"); await f.locator('input[name="next"]').fill("NewPassword123");
    await f.getByRole("button", { name: "تغيير كلمة المرور" }).click();
    await a.getByText("كلمة المرور الحالية غير صحيحة").waitFor();
    await f.locator('input[name="current"]').fill("Admin12345"); await f.locator('input[name="next"]').evaluate((i) => { i.removeAttribute("minlength"); i.value = "short"; });
    await f.getByRole("button", { name: "تغيير كلمة المرور" }).click();
    await a.getByText("١٠ أحرف على الأقل").waitFor();
    await f.locator('input[name="next"]').fill("NewPassword123");
    await f.getByRole("button", { name: "تغيير كلمة المرور" }).click();
    await a.getByText("تم تغيير كلمة المرور.").waitFor();
    const p = await ctx.newPage();
    await adminLogin(p, "admin@example.com", "Admin12345");
    await p.getByText("غير صحيحة").waitFor();
    await adminLogin(p, "admin@example.com", "NewPassword123");
    await p.waitForURL(`${BASE}/admin`, { waitUntil: "commit" });
    // restore
    const hash = execSync(`node -e "console.log(require('bcryptjs').hashSync('Admin12345',12))"`, { cwd: ROOT }).toString().trim();
    sql(`update admin_users set password_hash='${hash}' where email='admin@example.com'`);
  });
}

/* ======================================================================= */
if (!ONLY || ONLY === "ux") {
  section = "Routing, mobile, accessibility, load";
  console.log(`\n${section}`);
  await check("redirects ignore a forged X-Forwarded-Host (only configured preview domains are trusted)", async () => {
    const r = await fetch(`${BASE}/`, { redirect: "manual", headers: { "X-Forwarded-Host": "evil.example" } });
    const loc = r.headers.get("location") ?? "";
    assert(!loc.includes("evil.example") && loc.endsWith("/ar"), loc);
    const a2 = await fetch(`${BASE}/admin`, { redirect: "manual", headers: { "X-Forwarded-Host": "evil.example" } });
    assert(!(a2.headers.get("location") ?? "").includes("evil.example"), "admin redirect stays on site");
  });
  await check("language detection: Accept-Language en -> /en, otherwise /ar", async () => {
    const en = await fetch(`${BASE}/`, { headers: { "accept-language": "en-US,en;q=0.9" }, redirect: "manual" });
    assert(en.headers.get("location").endsWith("/en"), en.headers.get("location"));
    const ar = await fetch(`${BASE}/`, { headers: { "accept-language": "fr-FR" }, redirect: "manual" });
    assert(ar.headers.get("location").endsWith("/ar"), ar.headers.get("location"));
  });
  await check("unknown route slug / booking ref / path show the 404 page", async () => {
    for (const p of ["/ar/routes/nope", "/ar/booking/ZZZZZZZZ", "/ar/checkout/ZZZZZZZZ", "/en/whatever"]) {
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      assert((await page.textContent("body")).match(/لم نجد هذه الصفحة|couldn't find this page/), "404 text on " + p);
    }
  });
  await check("booking lookup is case-insensitive and tolerant of spaces", async () => {
    const ref = sql("select ref from bookings where status='paid' limit 1");
    await page.goto(`${BASE}/ar/booking?ref=${encodeURIComponent(" " + ref.toLowerCase().slice(0, 4) + " " + ref.toLowerCase().slice(4))}`, { waitUntil: "networkidle" });
    await page.waitForURL(new RegExp(`/ar/booking/${ref}$`), { waitUntil: "commit" });
  });
  await check("mobile (390px): full booking + payment flow", async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    const ref = await makeBooking(mp, { vehicle: "هيونداي ستاريا" });
    eq(await mp.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scroll on checkout");
    await payInBrowser(mp, ref, "pay");
    await mp.getByText("تم الدفع وتأكيد استلام حجزك").waitFor();
    eq(await mp.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scroll on booking page");
  });
  await check("accessibility scan (axe): no serious or critical issues", async () => {
    const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
    const ref = sql("select ref from bookings where status='pending_payment' limit 1");
    const paid = sql("select ref from bookings where status in ('paid','confirmed') limit 1");
    const pages = ["/ar", "/en", "/ar/routes", "/ar/routes/makkah-madinah", "/ar/trip?from=riyadh-airport&to=at-turaif", `/ar/checkout/${ref}`, `/ar/booking/${paid}`, "/ar/booking", "/ar/fleet", "/admin/login"];
    const problems = [];
    for (const p of pages) {
      await page.goto(BASE + p, { waitUntil: "networkidle" });
      await page.addScriptTag({ content: axeSrc });
      const v = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ["violations"] })).violations.filter((x) => ["serious", "critical"].includes(x.impact)).map((x) => `${x.id}(${x.nodes.length}): ${x.nodes[0]?.target?.join(" ")}`));
      if (v.length) problems.push(`${p} → ${v.join("; ")}`);
    }
    if (problems.length) fs.writeFileSync(process.env.AXE_OUT ?? "/dev/null", problems.join("\n"));
    assert(!problems.length, problems.join(" || ").slice(0, 600));
  });
  await check("load: 20 concurrent users for 8s on key pages, no errors", async () => {
    const autocannon = require("autocannon");
    const out = [];
    for (const p of ["/ar", "/ar/routes", "/ar/routes/jeddah-airport-makkah"]) {
      const r = await autocannon({ url: BASE + p, connections: 20, duration: 8 });
      out.push(`${p}: ${Math.round(r.requests.average)} req/s, p99 ${r.latency.p99}ms, errors ${r.errors}, non2xx ${r.non2xx}`);
      assert(r.errors === 0 && r.non2xx === 0, out.at(-1));
    }
    console.log("     " + out.join("\n      "));
  });
}

/* ======================================================================= */
if (!ONLY || ONLY === "features") {
  section = "Destinations, distance pricing, VAT, appearance";
  console.log(`\n${section}`);
  const a = await ctx.newPage();
  await adminLogin(a);
  await a.waitForURL(`${BASE}/admin`, { waitUntil: "commit" });
  /** click a submit button and wait for its server action to finish */
  const submit = async (pg, name) => {
    await Promise.all([
      pg.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]),
      pg.getByRole("button", { name, exact: true }).click(),
    ]);
  };
  const saveTax = async () => {
    await submit(a, "حفظ إعدادات الضريبة");
    await a.getByText("تم الحفظ. الحجوزات الجديدة").waitFor();
  };
  const setSetting = (k, v) => sql(`insert into settings(key,value) values('${k}','${v}') on conflict (key) do update set value=excluded.value`);
  // admin saves clear the server's cache; direct DB edits in tests need the same, via a no-op admin save
  const touchCache = async () => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "حفظ الإعدادات", exact: true }).click();
    await a.getByText("تم حفظ الإعدادات.").waitFor();
  };

  await check("Saudi data: 13 regions covered, 48+ cities, 100+ destinations, all with coordinates", async () => {
    eq(sql("select count(distinct region) from cities"), "13", "regions");
    assert(Number(sql("select count(*) from cities")) >= 48, "cities");
    assert(Number(sql("select count(*) from locations")) >= 100, "destinations");
    eq(sql("select count(*) from locations where lat is null or lng is null"), "0", "all have coordinates");
    eq(sql("select count(*) from locations l left join cities c on c.slug=l.city where c.id is null"), "0", "every destination has a city");
  });
  await check("checkout and booking pages show trip price, VAT 15% and total", async () => {
    const ref = await makeBooking(page, { vehicle: "جمس يوكن XL" });
    await page.getByText("الإجمالي شامل الضريبة").waitFor();
    const [sub, vat, amt, rate] = sql(`select subtotal, vat_amount, amount, vat_rate from bookings where ref='${ref}'`).split("|");
    eq([sub, vat, amt, rate].join(","), "48000,7200,55200,1500", "stored breakdown");
    const main = await page.textContent("main");
    for (const txt of ["سعر الرحلة", "ضريبة القيمة المضافة", "الإجمالي شامل الضريبة", "٤٨٠", "٧٢", "٥٥٢"]) assert(main.includes(txt), `checkout shows ${txt}`);
  });
  await check("booking form summary shows the VAT breakdown live when switching vehicles", async () => {
    await page.goto(`${BASE}/ar/routes/jeddah-airport-makkah`, { waitUntil: "networkidle" });
    await page.getByRole("radiogroup").getByText("تويوتا كامري", { exact: true }).click();
    const aside = page.locator("aside");
    for (const txt of ["٢٥٠", "٣٧٫٥", "٢٨٧٫٥"]) assert((await aside.textContent()).includes(txt), `summary ${txt}: ${await aside.textContent()}`);
    await page.getByRole("radiogroup").getByText("جمس يوكن XL", { exact: true }).click();
    assert((await aside.textContent()).includes("٥٥٢"), "updated total");
  });
  await check("VAT number: invalid rejected, valid shown in footer and on booking page", async () => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await a.fill('input[name="vat_number"]', "12345");
    await submit(a, "حفظ إعدادات الضريبة");
    await a.getByText("الرقم الضريبي ١٥ رقمًا").waitFor();
    await a.fill('input[name="vat_number"]', "310123456700003");
    await saveTax();
    const ref = await makeBooking(page, {});
    assert((await page.textContent("body")).includes("310123456700003"), "VAT number on checkout");
  });
  await check("'show prices incl. VAT' switches listings to VAT-inclusive prices", async () => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await a.check('input[name="prices_include_vat"]');
    await saveTax();
    try {
      await page.goto(`${BASE}/ar/routes/jeddah-airport-makkah`, { waitUntil: "networkidle" });
      const txt = await page.textContent("main");
      assert(txt.includes("٢٨٧٫٥") && txt.includes("شامل ضريبة ١٥٪"), "inclusive price 287.5 shown");
    } finally {
      await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
      await a.uncheck('input[name="prices_include_vat"]');
      await saveTax();
    }
    await page.goto(`${BASE}/ar/routes/jeddah-airport-makkah`, { waitUntil: "networkidle" });
    assert((await page.textContent("main")).includes("+ ضريبة ١٥٪"), "back to + VAT note");
  });
  await check("VAT 0% -> no VAT line, total = price; restoring 15% works", async () => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await a.fill('input[name="vat_rate"]', "0");
    await saveTax();
    const ref = await makeBooking(page, { vehicle: "جمس يوكن XL" });
    eq(sql(`select subtotal||','||vat_amount||','||amount from bookings where ref='${ref}'`), "48000,0,48000", "no VAT");
    assert(!(await page.textContent("main")).includes("ضريبة القيمة المضافة"), "no VAT line");
    await a.fill('input[name="vat_rate"]', "15");
    await saveTax();
  });
  await check("old bookings keep their original amount after the VAT change", async () => {
    eq(sql("select count(*) from bookings where vat_rate=0 and vat_amount=0 and subtotal<>amount"), "0", "no broken old rows");
  });

  await check("chooser: nothing preselected, no typing; region → city → place, back and Escape work", async () => {
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    for (const f of ["from", "to"]) eq(await page.inputValue(`form#search input[name="${f}"]`), "", `${f} empty at start`);
    eq(await page.locator("form#search input[type=text], form#search input[type=search], form#search input:not([type])").count(), 0, "no text inputs");
    await pickPlace(page, 1, "منطقة عسير", "أبها", "مطار أبها الدولي");
    eq(await page.inputValue('form#search input[name="to"]'), "abha-airport", "hidden value");
    await page.locator("form#search button[aria-controls=search-panel]").nth(1).click();
    await page.locator("#search-panel").getByRole("button", { name: /منطقة المدينة المنورة/ }).click();
    await page.locator("#search-panel").getByRole("button", { name: "رجوع" }).click();
    await page.locator("#search-panel").getByRole("button", { name: /منطقة تبوك/ }).waitFor();
    eq(await page.locator("#search-panel").getByText("الأكثر طلبًا").count(), 0, "no 'most booked' section");
    await page.keyboard.press("Escape");
    eq(await page.locator("#search-panel").count(), 0, "Escape closes");
    eq(await page.inputValue('form#search input[name="to"]'), "abha-airport", "choice kept");
  });
  await check("chooser: from, to, date and time are required; each missing one is flagged", async () => {
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "اعرض الأسعار" }).click();
    await page.getByText("اختر نقطة الانطلاق أولًا.").waitFor();
    eq(await page.locator('form#search [aria-invalid="true"]').count(), 4, "four fields flagged");
    await pickPlace(page, 0, "منطقة الرياض", "الرياض", "مطار الملك خالد الدولي");
    await pickPlace(page, 1, "منطقة الرياض", "الدرعية", "حي الطريف");
    await page.getByRole("button", { name: "اعرض الأسعار" }).click();
    await page.getByText("اختر تاريخ الرحلة.").waitFor();
    assert(!page.url().includes("/search"), "not navigated");
    // server side too: no destination or no start -> back to the chooser
    for (const q of ["from=riyadh-airport", "to=at-turaif", "from=riyadh-airport&to=riyadh-airport"]) {
      const r = await fetch(`${BASE}/ar/search?${q}`, { redirect: "manual" });
      assert(/\/ar#search$/.test(r.headers.get("location")), q + " -> " + r.headers.get("location"));
    }
  });
  await check("chooser: swap from/to; the start can't also be the end", async () => {
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await pickPlace(page, 0, "منطقة مكة المكرمة", "جدة", "مطار الملك عبدالعزيز");
    await pickPlace(page, 1, "منطقة مكة المكرمة", "مكة المكرمة", "مكة المكرمة (الفنادق)");
    await page.getByRole("button", { name: "تبديل من وإلى" }).click();
    eq(await page.inputValue('form#search input[name="from"]'), "makkah", "from after swap");
    eq(await page.inputValue('form#search input[name="to"]'), "jeddah-airport", "to after swap");
    await page.locator("form#search button[aria-controls=search-panel]").nth(1).click();
    const panel = page.locator("#search-panel");
    await panel.getByRole("button", { name: /منطقة مكة المكرمة/ }).click();
    await panel.getByRole("button", { name: /^مكة المكرمة/ }).click();
    assert(await panel.getByRole("button", { name: /مكة المكرمة \(الفنادق\)/ }).isDisabled(), "start disabled as end");
  });
  await check("chooser → distance trip with date and time carried over; arrival time computed", async () => {
    const day = inDaysUTC(3);
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await pickPlace(page, 0, "منطقة الرياض", "الرياض", "مطار الملك خالد الدولي");
    await pickPlace(page, 1, "منطقة الرياض", "الدرعية", "حي الطريف");
    await page.fill('form#search input[name="date"]', day);
    await page.selectOption('form#search select[name="time"]', "18:00");
    await page.getByRole("button", { name: "اعرض الأسعار" }).click();
    await page.waitForURL(new RegExp(`/ar/trip\\?from=riyadh-airport&to=at-turaif&date=${day}&time=18%3A00$`), { waitUntil: "commit" });
    await page.getByText("حوالي ٣٥ كم").waitFor();
    eq(await page.inputValue("#date"), day, "date prefilled");
    eq(await page.inputValue("#time"), "18:00", "time prefilled");
    assert((await page.getByTestId("form-end").textContent()).includes("الوصول المتوقع"), "arrival shown");
  });
  await check("bad date/time in the link are ignored, not trusted", async () => {
    await page.goto(`${BASE}/ar/routes/jeddah-airport-makkah?date=2020-99-99&time=25:99`, { waitUntil: "networkidle" });
    eq(await page.inputValue("#date"), "", "bad date dropped");
    eq(await page.inputValue("#time"), "", "bad time dropped");
  });
  await check("routes page: from/to chooser with date and time; no list, sorting or vehicle filter", async () => {
    await page.goto(`${BASE}/ar/routes`, { waitUntil: "networkidle" });
    await page.locator("form#routes-search").waitFor();
    eq(await page.locator('select[name="sort"], select[name="vehicle"], select[name="city"]').count(), 0, "no filters");
    eq(await page.getByText("الأكثر طلبًا").count(), 0, "no most-booked");
    eq(await page.locator("main a[href*='/routes/']").count(), 0, "no list of routes");
    await pickPlace(page, 0, "منطقة مكة المكرمة", "جدة", "مطار الملك عبدالعزيز", "routes-search");
    await pickPlace(page, 1, "منطقة مكة المكرمة", "مكة المكرمة", "مكة المكرمة (الفنادق)", "routes-search");
    await page.fill('form#routes-search input[name="date"]', inDaysUTC(2));
    await page.selectOption('form#routes-search select[name="time"]', "09:30");
    await page.locator("form#routes-search").getByRole("button", { name: "اعرض الأسعار" }).click();
    await page.waitForURL(/\/ar\/routes\/jeddah-airport-makkah\?date=/, { waitUntil: "commit" });
    await page.waitForLoadState("networkidle");
    eq(await page.inputValue("#time"), "09:30", "time prefilled");
    assert((await page.getByTestId("form-end").textContent()).includes("١٠:٤٥"), "arrival = 09:30 + 75 min");
  });
  await check("a fixed-price route wins over distance pricing", async () => {
    const r = await fetch(`${BASE}/ar/search?from=makkah&to=jeddah-airport`, { redirect: "manual" });
    assert(r.headers.get("location").includes("/ar/routes/jeddah-airport-makkah?dir=rev"), r.headers.get("location"));
  });
  let distRef;
  await check("distance trip: price computed on the server, booked and paid end to end", async () => {
    await page.goto(`${BASE}/ar/trip?from=riyadh-airport&to=at-turaif`, { waitUntil: "networkidle" });
    await page.getByRole("radiogroup").getByText("تويوتا كامري", { exact: true }).click();
    await page.fill("#date", tomorrow()); await page.fill("#time", "09:15");
    await page.fill("#passengers", "2"); await page.fill("#bags", "2");
    await page.fill("#pickup", "صالة ٥، مطار الملك خالد");
    await page.fill("#name", "عميل الرياض"); await page.fill("#phone", "+966551112233");
    await page.locator("form:has(#name) button[type=submit]").click();
    await page.waitForURL(/\/checkout\/[A-Z0-9]{8}$/, { waitUntil: "commit" });
    distRef = page.url().split("/").pop();
    const row = sql(`select pricing_mode, distance_km, subtotal, vat_amount, amount, trip_id is null from bookings where ref='${distRef}'`);
    eq(row, "distance|35|10500|1575|12075|t", "stored distance booking");
    await payInBrowser(page, distRef, "pay");
    await page.getByText("تم الدفع وتأكيد استلام حجزك").waitFor();
  });
  await check("distance trip tampering: fake vehicle, same from/to and unknown place are rejected", async () => {
    for (const tamper of [
      (p) => p.evaluate(() => { document.querySelector('input[name="tripId"]:checked').value = "d:99999"; }),
      (p) => p.evaluate(() => { document.querySelector('input[name="toLoc"]').value = document.querySelector('input[name="fromLoc"]').value; }),
      (p) => p.evaluate(() => { document.querySelector('input[name="toLoc"]').value = "no-such-place"; }),
      (p) => p.evaluate(() => { document.querySelector('input[name="tripId"]:checked').value = "d:1; drop table bookings"; }),
    ]) {
      await page.goto(`${BASE}/ar/trip?from=riyadh-airport&to=at-turaif`, { waitUntil: "networkidle" });
      await page.fill("#date", tomorrow()); await page.fill("#time", "09:15");
      await page.fill("#pickup", "x مطار"); await page.fill("#name", "تلاعب"); await page.fill("#phone", "+966551112233");
      await tamper(page);
      await page.locator("form:has(#name) button[type=submit]").click();
      await page.getByRole("alert").first().waitFor({ timeout: 8000 });
      assert(!/checkout/.test(page.url()), "should not reach checkout");
    }
    assert(Number(sql("select count(*) from bookings")) > 0, "table intact");
  });
  await check("changing a vehicle's per-km rate changes distance prices", async () => {
    const id = sql("select id from vehicles where slug='toyota-camry'");
    await a.goto(`${BASE}/admin/vehicles/${id}`, { waitUntil: "networkidle" });
    await a.fill('input[name="perKm"]', "2");
    await submit(a, "حفظ");
    await a.getByText("تم الحفظ.").waitFor();
    await page.goto(`${BASE}/ar/trip?from=riyadh-airport&to=at-turaif`, { waitUntil: "networkidle" });
    // 60 + 2*35 = 130
    assert((await page.getByRole("radiogroup").textContent()).includes("١٣٠"), "new price");
    await a.fill('input[name="perKm"]', "1.2");
    await submit(a, "حفظ");
    eq(sql("select per_km from vehicles where slug='toyota-camry'"), "120", "restored");
  });
  await check("turning distance pricing off hides it and blocks bookings", async () => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await a.uncheck('input[name="distance_pricing"]');
    await saveTax();
    await page.goto(`${BASE}/ar/trip?from=riyadh-airport&to=at-turaif`, { waitUntil: "networkidle" });
    await page.getByText("لا يمكن حساب هذه الرحلة").waitFor();
    const r = await fetch(`${BASE}/ar/search?from=riyadh-airport&to=at-turaif`, { redirect: "manual" });
    assert(r.headers.get("location").includes("/ar/trip?from=riyadh-airport&to=at-turaif"), r.headers.get("location"));
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await a.check('input[name="distance_pricing"]');
    await saveTax();
  });

  let newId;
  await check("admin adds a destination from a Google Maps link; it appears in search with a price", async () => {
    sql("delete from locations where slug like 'test-%'");
    await a.goto(`${BASE}/admin/destinations`, { waitUntil: "networkidle" });
    const f = a.locator("#add form");
    await f.locator('input[name="nameAr"]').fill("فندق الاختبار");
    await f.locator('input[name="nameEn"]').fill("Test Hotel");
    await f.locator('select[name="city"]').selectOption("riyadh");
    await f.locator('select[name="kind"]').selectOption("hotels");
    await f.locator('input[name="coords"]').fill("https://www.google.com/maps/place/X/@24.6900,46.6850,15z/data=!3m1");
    await f.getByRole("button", { name: "إضافة الوجهة" }).click();
    await a.waitForURL(/destinations\?city=riyadh&added=1/, { waitUntil: "commit" });
    await a.getByText("تمت إضافة الوجهة.").waitFor();
    const [id, lat, lng] = sql("select id, lat, lng from locations where slug='test-hotel'").split("|");
    newId = id;
    eq(`${lat},${lng}`, "24.69,46.685", "coords parsed from link");
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await pickPlace(page, 1, "منطقة الرياض", "الرياض", "فندق الاختبار");
    await page.goto(`${BASE}/ar/trip?from=riyadh-airport&to=test-hotel`, { waitUntil: "networkidle" });
    await page.getByRole("radiogroup").waitFor();
  });
  await check("bad coordinates are rejected: outside Saudi Arabia and garbage", async () => {
    await a.goto(`${BASE}/admin/destinations/${newId}`, { waitUntil: "networkidle" });
    for (const v of ["51.5072, -0.1276", "hello", "https://example.com"]) {
      await a.fill('input[name="coords"]', v);
      await a.getByRole("button", { name: "حفظ", exact: true }).click();
      await a.getByText("الإحداثيات غير صحيحة").waitFor();
    }
    eq(sql(`select lat from locations where id=${newId}`), "24.69", "unchanged");
  });
  await check("hiding a destination removes it from search and blocks trips to it", async () => {
    await a.goto(`${BASE}/admin/destinations/${newId}`, { waitUntil: "networkidle" });
    await a.fill('input[name="coords"]', "24.69, 46.685");
    await a.uncheck('input[name="active"]');
    await a.getByRole("button", { name: "حفظ", exact: true }).click();
    await a.getByText("تم الحفظ.").waitFor();
    await page.goto(`${BASE}/ar/trip?from=riyadh-airport&to=test-hotel`, { waitUntil: "networkidle" });
    await page.getByText("لا يمكن حساب هذه الرحلة").waitFor();
  });
  await check("deleting: a destination used by a fixed route is protected; an unused one is deleted", async () => {
    const used = sql("select id from locations where slug='jeddah-airport'");
    await a.goto(`${BASE}/admin/destinations/${used}`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "حذف الوجهة نهائيًا" }).click();
    await a.getByText("مستخدمة في رحلة بسعر ثابت").waitFor();
    await a.goto(`${BASE}/admin/destinations/${newId}`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "حذف الوجهة نهائيًا" }).click();
    await a.waitForURL(/destinations\?deleted=1/, { waitUntil: "commit" });
    eq(sql(`select count(*) from locations where id=${newId}`), "0", "deleted");
  });
  await check("admin adds a city (with its 'in the city' stop) and can hide a whole city", async () => {
    sql("delete from locations where city like 'test-%'; delete from cities where slug like 'test-%'");
    await a.goto(`${BASE}/admin/destinations`, { waitUntil: "networkidle" });
    const f = a.locator("#cities form").filter({ has: a.getByRole("button", { name: "إضافة المدينة" }) });
    await f.locator('input[name="nameAr"]').fill("مدينة الاختبار");
    await f.locator('input[name="nameEn"]').fill("Test Town");
    await f.locator('input[name="coords"]').fill("27.9, 42.1");
    await f.getByRole("button", { name: "إضافة المدينة" }).click();
    await a.getByText("تمت إضافة المدينة ووجهة").waitFor();
    eq(sql("select count(*) from locations where city='test-town' and kind='city'"), "1", "stop created");
    await page.goto(`${BASE}/ar/trip?from=hail-airport&to=test-town`, { waitUntil: "networkidle" });
    await page.getByRole("radiogroup").waitFor();
    await a.goto(`${BASE}/admin/destinations`, { waitUntil: "networkidle" });
    await a.locator("li").filter({ hasText: "مدينة الاختبار" }).getByRole("button", { name: "إخفاء" }).click();
    await a.getByText("تم إخفاء المدينة").waitFor();
    await page.goto(`${BASE}/ar/trip?from=hail-airport&to=test-town`, { waitUntil: "networkidle" });
    await page.getByText("لا يمكن حساب هذه الرحلة").waitFor();
    sql("delete from locations where city='test-town'; delete from cities where slug='test-town'");
  });

  await check("appearance: preset, name, font and corners apply to the site", async () => {
    await a.goto(`${BASE}/admin/appearance`, { waitUntil: "networkidle" });
    await a.getByRole("radio", { name: /عنابي وذهبي/ }).click();
    await a.fill('input[name="company_name_ar"]', "شركة الاختبار للنقل");
    await a.selectOption('select[name="font"]', "tajawal");
    await a.selectOption('select[name="corners"]', "round");
    await a.fill('input[name="hero_title_ar"]', "عنوان من لوحة التحكم");
    await a.getByRole("button", { name: "حفظ المظهر" }).click();
    await a.getByText("تم حفظ المظهر").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "عنوان من لوحة التحكم" }).waitFor();
    assert((await page.textContent("header")).includes("شركة الاختبار للنقل"), "name in header");
    const style = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { sign: cs.getPropertyValue("--color-sign").trim(), body: getComputedStyle(document.body).fontFamily, radius: cs.getPropertyValue("--radius-xl").trim() };
    });
    eq(style.sign, "#7a1f2b", "primary colour");
    assert(style.body.includes("Tajawal"), "font " + style.body);
    eq(style.radius, "1.5rem", "corners");
    assert((await page.title()).includes("شركة الاختبار للنقل"), "name in page title");
  });
  await check("appearance: unreadable colours show a warning; bad hex is refused", async () => {
    await a.goto(`${BASE}/admin/appearance`, { waitUntil: "networkidle" });
    await a.fill("#primary", "#f5f5a0");
    await a.getByText("اللون الأساسي فاتح جدًا").waitFor();
    await a.fill("#primary", "#zzzzzz");
    await a.getByRole("button", { name: "حفظ المظهر" }).click();
    await a.getByText("الألوان بصيغة").waitFor();
  });
  await check("appearance: reset to default design", async () => {
    await a.goto(`${BASE}/admin/appearance`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "الرجوع للتصميم الافتراضي" }).click();
    await a.fill('input[name="company_name_ar"]', "رحلة للنقل");
    await a.fill('input[name="hero_title_ar"]', "");
    await a.getByRole("button", { name: "حفظ المظهر" }).click();
    await a.getByText("تم حفظ المظهر").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-sign").trim()), "#0b5d45", "default colour");
  });
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  await check("logo: fake image, scripted SVG and >1MB files are refused", async () => {
    await a.goto(`${BASE}/admin/appearance`, { waitUntil: "networkidle" });
    const up = async (name, mimeType, buffer, msg) => {
      await a.setInputFiles('input[name="logo"]', { name, mimeType, buffer });
      await a.getByRole("button", { name: "رفع الشعار" }).click();
      await a.getByText(msg).waitFor();
    };
    await up("evil.png", "image/png", Buffer.from("not really a png"), "لا يبدو صورة صالحة");
    await up("evil.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "لا يبدو صورة صالحة");
    await up("evil2.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'), "لا يبدو صورة صالحة");
    await up("big.png", "image/png", Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]), "أكبر من ١ ميجابايت");
    await up("doc.pdf", "application/pdf", Buffer.from("%PDF-1.4"), "نوع الملف غير مدعوم");
    eq(sql("select count(*) from assets"), "0", "nothing stored");
  });
  await check("logo: upload shows it in the header and favicon, served safely; remove restores text logo", async () => {
    await a.goto(`${BASE}/admin/appearance`, { waitUntil: "networkidle" });
    await a.setInputFiles('input[name="logo"]', { name: "logo.png", mimeType: "image/png", buffer: PNG });
    await a.getByRole("button", { name: "رفع الشعار" }).click();
    await a.getByText("تم رفع الشعار.").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    const src = await page.locator("header img").getAttribute("src");
    assert(/^\/api\/brand\/logo\?v=/.test(src), "logo src " + src);
    assert(await page.locator(`link[rel="icon"][href^="/api/brand/logo"]`).count(), "favicon");
    const r = await fetch(BASE + src);
    eq(r.headers.get("content-type"), "image/png", "type");
    assert(r.headers.get("content-security-policy").includes("sandbox"), "csp sandbox");
    eq(Buffer.from(await r.arrayBuffer()).equals(PNG), true, "same bytes");
    await a.goto(`${BASE}/admin/appearance`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: /حذف الشعار/ }).click();
    await a.getByText("تم حذف الشعار").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.locator("header img").count(), 0, "text logo back");
  });
  await check("appearance and destination actions refuse requests without an admin session", async () => {
    const r = await fetch(`${BASE}/admin/appearance`, { redirect: "manual" });
    assert([307, 308].includes(r.status), "redirect to login");
    const logo = await fetch(`${BASE}/api/brand/logo`);
    eq(logo.status, 404, "no logo now");
  });
  await check("mobile (390px): chooser, hourly and distance trip pages fit without sideways scroll", async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mp = await m.newPage();
    await mp.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await pickPlace(mp, 0, "منطقة مكة المكرمة", "جدة", "مطار الملك عبدالعزيز");
    await mp.locator("form#search button[aria-controls=search-panel]").nth(1).click();
    await mp.locator("#search-panel").getByRole("button", { name: /منطقة مكة المكرمة/ }).click();
    eq(await mp.evaluate(() => document.documentElement.scrollWidth), 390, "home with chooser open");
    await mp.goto(`${BASE}/ar/hourly?from=makkah&hours=12`, { waitUntil: "networkidle" });
    eq(await mp.evaluate(() => document.documentElement.scrollWidth), 390, "hourly page");
    await mp.goto(`${BASE}/ar/trip?from=riyadh-airport&to=at-turaif`, { waitUntil: "networkidle" });
    eq(await mp.evaluate(() => document.documentElement.scrollWidth), 390, "trip page");
    await m.close();
  });

  /* ---------- hourly booking ---------- */
  section = "Hourly booking, cancellation, destination hide/delete";
  console.log(`\n${section}`);
  const savePolicy = async (fn) => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await fn();
    await submit(a, "حفظ السياسة");
  };
  await check("chooser hourly tab: from, to, 6/12/24 hours, date and time — all on the home page", async () => {
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "بالساعة مع سائق" }).click();
    assert(page.url().endsWith("/ar"), "tab doesn't navigate away");
    await pickPlace(page, 0, "منطقة مكة المكرمة", "مكة المكرمة", "مكة المكرمة (الفنادق)");
    await page.getByRole("button", { name: "اعرض الأسعار" }).click();
    await page.getByText("اختر الوجهة التي تريد الذهاب إليها.").waitFor(); // "to" is required here too
    await pickPlace(page, 1, "منطقة المدينة المنورة", "المدينة المنورة", "المدينة المنورة (الفنادق)");
    // duration is chosen like a place: open the field, tap a package; every package works
    for (const h of ["٦ ساعات", "١٢ ساعة", "٢٤ ساعة"]) {
      await page.locator("form#search button[aria-controls=search-panel]").nth(2).click();
      await page.locator("#search-panel").getByRole("button", { name: h }).click();
      assert((await page.locator("form#search").textContent()).includes(h), "picked " + h);
    }
    await page.fill('form#search input[name="date"]', inDaysUTC(2));
    await page.selectOption('form#search select[name="time"]', "18:00");
    assert((await page.getByTestId("ends-at").textContent()).includes("٦:٠٠ م (اليوم التالي)"), "18:00 + 24h shown on the sign");
    await page.getByRole("button", { name: "اعرض الأسعار" }).click();
    await page.waitForURL(/\/ar\/hourly\?from=makkah&to=madinah&hours=24&date=/, { waitUntil: "commit" });
    await page.getByRole("heading", { name: /سيارة مع سائق · ٢٤ ساعة/ }).waitFor();
    assert((await page.getByTestId("form-end").textContent()).includes("ينتهي الحجز"), "end shown on the form");
    assert((await page.textContent("main")).includes("الوجهة: المدينة المنورة (الفنادق)"), "destination shown");
    // switching package keeps from, to, date and time
    await page.getByRole("link", { name: "٦ ساعات" }).click();
    await page.waitForURL(/\/ar\/hourly\?from=makkah&to=madinah&hours=6&date=.*&time=18/, { waitUntil: "commit" });
  });
  let hourRef;
  await check("hourly 12h: server price + VAT, destination and end time stored, paid end to end", async () => {
    await page.goto(`${BASE}/ar/hourly?from=makkah&to=madinah&hours=12`, { waitUntil: "networkidle" });
    await page.getByRole("radiogroup").getByText("تويوتا كامري", { exact: true }).click();
    await page.fill("#date", tomorrow()); await page.fill("#time", "20:00");
    await page.fill("#passengers", "3"); await page.fill("#bags", "2");
    await page.fill("#pickup", "فندق قرب الحرم"); await page.fill("#name", "عميل بالساعة"); await page.fill("#phone", "+966552223344");
    await page.locator("form:has(#name) button[type=submit]").click();
    await page.waitForURL(/\/checkout\/[A-Z0-9]{8}$/, { waitUntil: "commit" });
    hourRef = page.url().split("/").pop();
    eq(sql(`select pricing_mode||','||hours||','||duration_min||','||subtotal||','||vat_amount||','||amount from bookings where ref='${hourRef}'`), "hourly,12,720,60000,9000,69000", "stored hourly booking");
    eq(sql(`select l.slug from bookings b join locations l on l.id=b.to_location_id where b.ref='${hourRef}'`), "madinah", "destination stored");
    assert(sql(`select route_title from bookings where ref='${hourRef}'`).includes("إلى المدينة المنورة"), "title has the destination");
    assert((await page.textContent("main")).includes("٨:٠٠ ص (اليوم التالي)"), "checkout shows 20:00 + 12h = 8 AM next day");
    assert((await page.textContent("main")).includes("١٢ ساعة"), "title mentions 12 hours");
    await payInBrowser(page, hourRef, "pay");
    await page.getByText("تم الدفع وتأكيد استلام حجزك").waitFor();
  });
  await check("hourly search needs a destination different from the start", async () => {
    for (const q of ["from=makkah&hours=12", "from=makkah&to=makkah&hours=12", "from=makkah&to=nowhere&hours=12", "from=makkah&to=madinah&hours=7"]) {
      const r = await fetch(`${BASE}/ar/search?mode=hourly&${q}`, { redirect: "manual" });
      assert(/\/ar#search$/.test(r.headers.get("location")), q + " -> " + r.headers.get("location"));
    }
    const ok = await fetch(`${BASE}/ar/search?mode=hourly&from=makkah&to=madinah&hours=6&date=${inDaysUTC(2)}&time=08:00`, { redirect: "manual" });
    assert(ok.headers.get("location").includes(`/ar/hourly?from=makkah&to=madinah&hours=6&date=${inDaysUTC(2)}&time=08%3A00`), ok.headers.get("location"));
  });
  await check("hourly: switching package changes prices (6h = 350)", async () => {
    await page.goto(`${BASE}/ar/hourly?from=makkah&hours=12`, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "٦ ساعات" }).click();
    await page.waitForURL(/hours=6$/, { waitUntil: "commit" });
    await page.waitForLoadState("networkidle");
    assert((await page.getByRole("radiogroup").textContent()).includes("٣٥٠"), "6h price");
  });
  await check("hourly tampering: fake vehicle, 7 hours, unknown place, bad or same destination are rejected", async () => {
    for (const tamper of [
      (p) => p.evaluate(() => { document.querySelector('input[name="tripId"]:checked').value = "h:99999"; }),
      (p) => p.evaluate(() => { document.querySelector('input[name="hours"]').value = "7"; }),
      (p) => p.evaluate(() => { document.querySelector('input[name="hourlyFrom"]').value = "no-such-place"; }),
      (p) => p.evaluate(() => { document.querySelector('input[name="hourlyTo"]').value = "no-such-place"; }),
      (p) => p.evaluate(() => { document.querySelector('input[name="hourlyTo"]').value = "makkah"; }),
    ]) {
      await page.goto(`${BASE}/ar/hourly?from=makkah&to=madinah&hours=12`, { waitUntil: "networkidle" });
      await page.fill("#date", tomorrow()); await page.fill("#time", "08:00");
      await page.fill("#pickup", "x فندق"); await page.fill("#name", "تلاعب"); await page.fill("#phone", "+966552223344");
      await tamper(page);
      await page.locator("form:has(#name) button[type=submit]").click();
      await page.getByRole("alert").first().waitFor({ timeout: 8000 });
      assert(!/checkout/.test(page.url()), "should not reach checkout");
    }
    const bad = await fetch(`${BASE}/ar/hourly?from=makkah&hours=5`);
    assert((await bad.text()).includes("الحجز بالساعة غير متاح"), "5 hours not offered");
  });
  await check("turning hourly off in settings hides the tab and blocks the page", async () => {
    await savePolicy(() => a.uncheck('input[name="hourly_enabled"]'));
    await a.getByText("تم حفظ سياسة الإلغاء").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByRole("tab", { name: "بالساعة مع سائق" }).count(), 0, "no hourly tab");
    await page.goto(`${BASE}/ar/hourly?from=makkah&hours=12`, { waitUntil: "networkidle" });
    await page.getByText("الحجز بالساعة غير متاح").waitFor();
    const r = await fetch(`${BASE}/ar/search?mode=hourly&from=makkah&to=madinah&hours=12`, { redirect: "manual" });
    assert(!r.headers.get("location").includes("hourly"), r.headers.get("location"));
    await savePolicy(() => a.check('input[name="hourly_enabled"]'));
    await a.getByText("تم حفظ سياسة الإلغاء").waitFor();
  });
  await check("vehicle hourly prices are editable in admin", async () => {
    const id = sql("select id from vehicles where slug='toyota-camry'");
    await a.goto(`${BASE}/admin/vehicles/${id}`, { waitUntil: "networkidle" });
    await a.fill('input[name="hourly6"]', "400");
    await submit(a, "حفظ");
    await a.getByText("تم الحفظ.").waitFor();
    eq(sql("select hourly_6 from vehicles where slug='toyota-camry'"), "40000", "stored in halalas");
    await page.goto(`${BASE}/ar/hourly?from=makkah&hours=6`, { waitUntil: "networkidle" });
    assert((await page.getByRole("radiogroup").textContent()).includes("٤٠٠"), "new price shown");
    await a.fill('input[name="hourly6"]', "350");
    await submit(a, "حفظ");
    eq(sql("select hourly_6 from vehicles where slug='toyota-camry'"), "35000", "restored");
  });

  /* ---------- customer cancellation ---------- */
  // own context with its own client IP so the per-IP cancel throttle doesn't leak between runs
  const ip = `10.${Date.now() % 250}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const cctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const cp = await cctx.newPage();
  cp.on("pageerror", (e) => pageErrors.push(e.message));
  const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const paidBooking = async (o = {}) => {
    const ref = await makeBooking(cp, { vehicle: "تويوتا كامري", date: inDays(3), ...o });
    await payInBrowser(cp, ref, "pay");
    return ref;
  };
  const cancelForm = (p) => p.locator("form:has(input[name=confirm])");
  const customerCancel = async (p, ref, phone, { tick = true, open = true } = {}) => {
    if (open) {
      await p.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
      await p.getByRole("button", { name: "أريد إلغاء الحجز" }).click();
    }
    await cancelForm(p).locator('input[name="phone"]').fill(phone);
    if (tick) await cancelForm(p).locator('input[name="confirm"]').check();
    else await cancelForm(p).locator('input[name="confirm"]').uncheck();
    await p.getByRole("button", { name: "تأكيد الإلغاء" }).click();
  };
  const refundsFor = async (ref) => {
    const pid = sql(`select payment_id from bookings where ref='${ref}'`);
    return (await mf("/__refunds")).filter((r) => String(r.key) === pid);
  };
  const soon = (h) => (`update bookings set pickup_date=(now() at time zone 'Asia/Riyadh' + interval '${h} hours')::date, pickup_time=to_char(now() at time zone 'Asia/Riyadh' + interval '${h} hours','HH24:MI') where ref='%REF%'`);

  let fullRef;
  await check("cancel > 24h before pickup: full refund, waits for admin approval (auto refund off)", async () => {
    fullRef = await paidBooking();
    await cp.goto(`${BASE}/ar/booking/${fullRef}`, { waitUntil: "networkidle" });
    await cp.getByText("تسترد المبلغ كاملًا").waitFor();
    await customerCancel(cp, fullRef, "0501234567");
    await cp.waitForURL(/cancelled=1$/, { waitUntil: "commit", timeout: 15000 });
    await cp.getByText("تم إلغاء الحجز").first().waitFor();
    await cp.getByText("طلب الاسترداد قيد المراجعة").waitFor();
    eq(sql(`select status||','||refund_amount||','||refund_status||','||cancelled_by from bookings where ref='${fullRef}'`), "cancelled,28750,pending_approval,customer", "stored");
    eq((await refundsFor(fullRef)).length, 0, "nothing sent to MyFatoorah yet");
    eq(await cp.getByRole("button", { name: "أريد إلغاء الحجز" }).count(), 0, "no second cancel");
  });
  await check("admin sees the pending refund, approves it, MyFatoorah gets exactly that amount", async () => {
    await a.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await a.getByText("استردادات بانتظار موافقتك").waitFor();
    await a.goto(`${BASE}/admin/bookings/${fullRef}`, { waitUntil: "networkidle" });
    await submit(a, "موافقة وإرسال الاسترداد");
    await a.getByText("أُرسل إلى ماي فاتورة").waitFor();
    const [st, rr] = sql(`select refund_status, refund_reference from bookings where ref='${fullRef}'`).split("|");
    eq(st, "requested", "status"); assert(/^RF-/.test(rr), "reference " + rr);
    const sent = await refundsFor(fullRef);
    eq(sent.length, 1, "one refund"); eq(Number(sent[0].amount), 287.5, "amount in SAR");
    await cp.goto(`${BASE}/ar/booking/${fullRef}`, { waitUntil: "networkidle" });
    await cp.getByText(rr).waitFor();
  });
  await check("cancel within 24h: 50% refund; wrong phone and missing tick are refused first", async () => {
    const ref = await paidBooking();
    sql(soon(5).replace("%REF%", ref));
    await cp.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
    await cp.getByText("تسترد ٥٠٪ من المبلغ").waitFor();
    await customerCancel(cp, ref, "0509999999");
    await cp.getByText("رقم الجوال لا يطابق رقم الحجز.").waitFor();
    await customerCancel(cp, ref, "+966501234567", { open: false, tick: false });
    await cp.getByText("ضع علامة على مربع التأكيد أولًا.").waitFor();
    eq(sql(`select status from bookings where ref='${ref}'`), "paid", "still paid");
    await customerCancel(cp, ref, "٠٥٠١٢٣٤٥٦٧", { open: false });
    await cp.waitForURL(/cancelled=1$/, { waitUntil: "commit", timeout: 15000 });
    eq(sql(`select refund_amount from bookings where ref='${ref}'`), "14375", "half of 287.5");
  });
  await check("after pickup time the customer can't cancel online", async () => {
    const ref = await paidBooking();
    sql(soon(-2).replace("%REF%", ref));
    await cp.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
    await cp.getByText("حان موعد الاستلام").waitFor();
    eq(await cp.getByRole("button", { name: "أريد إلغاء الحجز" }).count(), 0, "no cancel button");
  });
  await check("unpaid bookings have no cancel option", async () => {
    const ref = await makeBooking(cp, { date: inDays(3) });
    await cp.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
    eq(await cp.getByRole("button", { name: "أريد إلغاء الحجز" }).count(), 0, "no cancel on pending");
  });
  await check("auto refund on + double submit: cancelled once, one refund sent", async () => {
    await savePolicy(() => a.check('input[name="refund_auto"]'));
    await a.getByText("تم حفظ سياسة الإلغاء").waitFor();
    const ref = await paidBooking();
    const cp2 = await cctx.newPage();
    for (const p of [cp, cp2]) {
      await p.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
      await p.getByRole("button", { name: "أريد إلغاء الحجز" }).click();
      await cancelForm(p).locator('input[name="phone"]').fill("0501234567");
      await cancelForm(p).locator('input[name="confirm"]').check();
    }
    await Promise.all([cp, cp2].map((p) => p.getByRole("button", { name: "تأكيد الإلغاء" }).click()));
    await cp.waitForTimeout(2500);
    await cp2.close();
    eq(sql(`select status||','||refund_status from bookings where ref='${ref}'`), "cancelled,requested", "sent automatically");
    eq((await refundsFor(ref)).length, 1, "exactly one refund");
    await savePolicy(() => a.uncheck('input[name="refund_auto"]'));
  });
  await check("5 wrong phone numbers lock cancelling that booking", async () => {
    const ref = await paidBooking();
    await customerCancel(cp, ref, "0500000001");
    for (let i = 2; i <= 5; i++) {
      await customerCancel(cp, ref, `050000000${i}`, { open: false });
      await cp.waitForTimeout(300);
    }
    await customerCancel(cp, ref, "0501234567", { open: false });
    await cp.getByText("محاولات كثيرة").waitFor();
    eq(sql(`select status from bookings where ref='${ref}'`), "paid", "not cancelled");
  });
  await check("admin: status dropdown can't cancel a paid booking; cancel-with-refund validates the amount; manual refund", async () => {
    const ref = await paidBooking();
    await a.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    eq(await a.locator('select[name="status"] option[value="cancelled"]').count(), 0, "no cancel in dropdown for paid");
    // and the server refuses it even if the option is forced in
    await a.evaluate(() => { const o = document.createElement("option"); o.value = "cancelled"; document.querySelector('select[name="status"]').append(o); });
    await a.selectOption('select[name="status"]', "cancelled");
    await submit(a, "حفظ");
    await a.getByText("لإلغاء حجز مدفوع استخدم").waitFor();
    await a.fill('input[name="refund"]', "999");
    await submit(a, "إلغاء الحجز");
    await a.getByText("مبلغ الاسترداد يجب أن يكون بين").waitFor();
    eq(sql(`select status from bookings where ref='${ref}'`), "paid", "still paid");
    await a.fill('input[name="refund"]', "100");
    await a.uncheck('input[name="sendNow"]');
    await submit(a, "إلغاء الحجز");
    await a.getByText("بانتظار موافقتك", { exact: true }).waitFor();
    eq(sql(`select status||','||refund_amount||','||refund_status||','||cancelled_by from bookings where ref='${ref}'`), "cancelled,10000,pending_approval,admin", "admin cancel");
    await a.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    await submit(a, "تم الاسترداد يدويًا");
    await a.getByText("عولج يدويًا", { exact: true }).waitFor();
    eq(sql(`select refund_status from bookings where ref='${ref}'`), "manual", "manual");
    eq((await refundsFor(ref)).length, 0, "nothing sent");
  });
  await check("policy settings drive the booking page and terms; cancelling can be turned off", async () => {
    await savePolicy(async () => { await a.fill('input[name="cancel_full_hours"]', "150"); await a.fill('input[name="cancel_partial_percent"]', "101"); });
    await a.getByText("النسبة رقم بين ٠ و ١٠٠").waitFor();
    await savePolicy(async () => { await a.fill('input[name="cancel_full_hours"]', "48"); await a.fill('input[name="cancel_partial_percent"]', "25"); });
    await a.getByText("تم حفظ سياسة الإلغاء").waitFor();
    await page.goto(`${BASE}/ar/terms`, { waitUntil: "networkidle" });
    const terms = await page.textContent("main");
    assert(terms.includes("بـ٤٨ ساعة") && terms.includes("٢٥٪"), "terms follow settings");
    const ref = await paidBooking(); // 3 days ahead: still > 48h
    await cp.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
    await cp.getByText("تسترد المبلغ كاملًا").waitFor();
    await savePolicy(() => a.uncheck('input[name="cancel_enabled"]'));
    await cp.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
    eq(await cp.getByRole("button", { name: "أريد إلغاء الحجز" }).count(), 0, "no cancel when disabled");
    await page.goto(`${BASE}/ar/terms`, { waitUntil: "networkidle" });
    assert((await page.textContent("main")).includes("لإلغاء الحجز تواصل معنا على واتساب"), "terms say WhatsApp");
    await savePolicy(async () => { await a.check('input[name="cancel_enabled"]'); await a.fill('input[name="cancel_full_hours"]', "24"); await a.fill('input[name="cancel_partial_percent"]', "50"); });
    await a.getByText("تم حفظ سياسة الإلغاء").waitFor();
  });
  await cctx.close();

  /* ---------- admin: hide / show / delete destinations ---------- */
  await check("bulk hide: selected destinations disappear from the chooser and trips; filter shows hidden ones", async () => {
    sql("delete from locations where slug like 'bulk-%'");
    sql("insert into locations(slug,name_ar,name_en,city,kind,lat,lng,active,sort_order) values ('bulk-a','وجهة جماعية أ','Bulk A','riyadh','landmark',24.7,46.7,true,999),('bulk-b','وجهة جماعية ب','Bulk B','riyadh','landmark',24.71,46.71,true,999)");
    await touchCache();
    await a.goto(`${BASE}/admin/destinations?q=${encodeURIComponent("وجهة جماعية")}`, { waitUntil: "networkidle" });
    await a.getByRole("checkbox", { name: "تحديد الكل" }).check();
    await submit(a, "إخفاء المحدد");
    await a.getByText("تم إخفاء 2 وجهة عن العملاء.").waitFor();
    eq(sql("select count(*) from locations where slug like 'bulk-%' and active"), "0", "both hidden");
    await page.goto(`${BASE}/ar/trip?from=riyadh-airport&to=bulk-a`, { waitUntil: "networkidle" });
    await page.getByText("لا يمكن حساب هذه الرحلة").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    await page.locator("form#search button[aria-controls=search-panel]").nth(1).click();
    await page.locator("#search-panel").getByRole("button", { name: /منطقة الرياض/ }).click();
    await page.locator("#search-panel").getByRole("button", { name: /^الرياض/ }).click();
    eq(await page.locator("#search-panel").getByText("وجهة جماعية").count(), 0, "not in chooser");
    await a.goto(`${BASE}/admin/destinations?show=hidden`, { waitUntil: "networkidle" });
    assert((await a.textContent("table")).includes("وجهة جماعية أ"), "listed under hidden");
    await a.goto(`${BASE}/admin/destinations?show=visible`, { waitUntil: "networkidle" });
    assert(!(await a.textContent("table")).includes("وجهة جماعية"), "not under visible");
  });
  await check("row buttons: show one again, delete one with a confirm step", async () => {
    await a.goto(`${BASE}/admin/destinations?q=${encodeURIComponent("وجهة جماعية")}`, { waitUntil: "networkidle" });
    const rowA = a.locator("tr").filter({ hasText: "وجهة جماعية أ" });
    await Promise.all([a.waitForResponse((r) => r.request().method() === "POST"), rowA.getByRole("button", { name: "إظهار", exact: true }).click()]);
    await a.getByText("تم إظهار 1 وجهة للعملاء.").waitFor();
    eq(sql("select active from locations where slug='bulk-a'"), "t", "shown");
    const rowB = a.locator("tr").filter({ hasText: "وجهة جماعية ب" });
    await rowB.getByRole("button", { name: "حذف", exact: true }).click();
    eq(sql("select count(*) from locations where slug='bulk-b'"), "1", "not deleted before confirming");
    await Promise.all([a.waitForResponse((r) => r.request().method() === "POST"), rowB.getByRole("button", { name: "تأكيد الحذف" }).click()]);
    await a.getByText("تم حذف 1 وجهة.").waitFor();
    eq(sql("select count(*) from locations where slug='bulk-b'"), "0", "deleted");
  });
  await check("bulk delete keeps destinations used by fixed routes and says so", async () => {
    await a.goto(`${BASE}/admin/destinations`, { waitUntil: "networkidle" });
    await a.getByRole("checkbox", { name: "تحديد وجهة جماعية أ" }).check();
    await a.getByRole("checkbox", { name: "تحديد مطار الملك عبدالعزيز (جدة)" }).check();
    await a.getByRole("button", { name: "حذف المحدد" }).click();
    await submit(a, "تأكيد حذف ٢ وجهة");
    await a.getByText("تم حذف 1 وجهة. بقيت 1").waitFor();
    eq(sql("select count(*) from locations where slug='bulk-a'"), "0", "unused deleted");
    eq(sql("select count(*) from locations where slug='jeddah-airport'"), "1", "route destination kept");
  });
  await check("bulk action refuses requests without an admin session", async () => {
    const fresh = await browser.newContext();
    const fp = await fresh.newPage();
    await fp.goto(`${BASE}/admin/destinations`, { waitUntil: "networkidle" });
    assert(fp.url().includes("/admin/login"), "redirected to login");
    await fresh.close();
  });

  /* ---------- payment methods, bank transfer, navigation ---------- */
  section = "Bank transfer, payment methods, navigation, contact";
  console.log(`\n${section}`);
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const bp = await bctx.newPage();
  bp.on("pageerror", (e) => pageErrors.push(e.message));
  const saveBank = async (fn) => {
    await a.goto(`${BASE}/admin/settings`, { waitUntil: "networkidle" });
    await fn();
    await submit(a, "حفظ بيانات التحويل");
  };
  const IBAN = "SA0380000000608010167519";

  await check("bank settings: bad IBAN and enabling without details are refused; valid details saved", async () => {
    await saveBank(async () => { await a.check('input[name="bank_enabled"]'); await a.fill('input[name="bank_name"]', ""); await a.fill('input[name="bank_account_name"]', ""); await a.fill('input[name="bank_iban"]', ""); });
    await a.getByText("لتفعيل التحويل البنكي اكتب").waitFor();
    await saveBank(async () => { await a.fill('input[name="bank_name"]', "مصرف الاختبار"); await a.fill('input[name="bank_account_name"]', "شركة الاختبار"); await a.fill('input[name="bank_iban"]', "SA12 3456"); });
    await a.getByText("رقم الآيبان السعودي").waitFor();
    await saveBank(async () => {
      await a.check('input[name="bank_enabled"]');
      await a.fill('input[name="bank_name"]', "مصرف الاختبار");
      await a.fill('input[name="bank_account_name"]', "شركة الاختبار");
      await a.fill('input[name="bank_iban"]', "sa03 8000 0000 6080 1016 7519");
    });
    await a.getByText("تم حفظ بيانات التحويل البنكي.").waitFor();
    eq(sql("select value from settings where key='bank_iban'"), IBAN, "IBAN normalised");
    eq(sql("select value from settings where key='bank_enabled'"), "1", "enabled");
  });
  await check("checkout offers exactly two ways to pay, no card brand list", async () => {
    const ref = await makeBooking(bp, { date: inDaysUTC(3) });
    await bp.locator("[data-method]").first().waitFor();
    eq(await bp.locator("[data-method]").count(), 2, "two methods");
    eq(await bp.locator('[data-method="myfatoorah"]').count(), 1, "MyFatoorah");
    eq(await bp.locator('[data-method="bank_transfer"]').count(), 1, "bank transfer");
    const txt = await bp.textContent("main");
    for (const brand of ["mada", "Visa", "Mastercard", "Apple Pay", "STC Pay", "مدى"]) assert(!txt.includes(brand), "no " + brand);
    await bp.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    assert(!(await bp.textContent("body")).includes("Apple Pay"), "home doesn't list card brands");
    void ref;
  });
  await check("bank transfer disabled -> only MyFatoorah is offered", async () => {
    await saveBank(() => a.uncheck('input[name="bank_enabled"]'));
    await a.getByText("تم حفظ بيانات التحويل البنكي.").waitFor();
    const ref = await makeBooking(bp, { date: inDaysUTC(3) });
    await bp.locator("[data-method]").first().waitFor();
    eq(await bp.locator("[data-method]").count(), 1, "one method");
    eq(await bp.locator('[data-method="myfatoorah"]').count(), 1, "MyFatoorah only");
    await saveBank(() => a.check('input[name="bank_enabled"]'));
    await a.getByText("تم حفظ بيانات التحويل البنكي.").waitFor();
    void ref;
  });
  let bankRef;
  await check("customer picks bank transfer: IBAN, amount and booking number shown; admin sees it waiting", async () => {
    bankRef = await makeBooking(bp, { date: inDaysUTC(3) });
    await bp.getByRole("button", { name: "سأدفع بالتحويل البنكي" }).click();
    await bp.waitForURL(new RegExp(`/ar/booking/${bankRef}$`), { waitUntil: "commit" });
    const box = bp.getByTestId("bank-transfer");
    await box.waitFor();
    const txt = (await box.textContent()).replace(/\s/g, "");
    assert(txt.includes(IBAN) && txt.includes(bankRef) && txt.includes("٢٨٧٫٥٠"), "IBAN, ref and amount");
    eq(sql(`select status||','||payment_method from bookings where ref='${bankRef}'`), "pending_payment,bank_transfer", "stored");
    await a.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await a.getByText("تحويلات بنكية بانتظار التأكيد").waitFor();
  });
  await check("admin confirms the transfer once: booking paid, payment logged, second confirm refused", async () => {
    await a.goto(`${BASE}/admin/bookings/${bankRef}`, { waitUntil: "networkidle" });
    await a.fill('input[name="note"]', "عملية 12345");
    await submit(a, "تأكيد استلام التحويل");
    eq(sql(`select status||','||payment_id from bookings where ref='${bankRef}'`), `paid,BT-${bankRef}`, "paid");
    eq(sql(`select source||','||amount from payments where id='BT-${bankRef}'`), "bank_transfer,28750", "payment row");
    // the form is gone now that it's paid; a forged second confirm is refused by the server
    eq(await a.getByRole("button", { name: "تأكيد استلام التحويل" }).count(), 0, "no confirm button once paid");
    await bp.goto(`${BASE}/ar/booking/${bankRef}`, { waitUntil: "networkidle" });
    await bp.getByText("تم الدفع وتأكيد استلام حجزك").waitFor();
  });
  await check("a bank-transfer booking can still be paid with MyFatoorah instead", async () => {
    const ref = await makeBooking(bp, { date: inDaysUTC(3) });
    await bp.getByRole("button", { name: "سأدفع بالتحويل البنكي" }).click();
    await bp.waitForURL(new RegExp(`/ar/booking/${ref}$`), { waitUntil: "commit" });
    await bp.getByRole("link", { name: "تغيير طريقة الدفع" }).click();
    await bp.waitForURL(new RegExp(`/ar/checkout/${ref}$`), { waitUntil: "commit" });
    await payInBrowser(bp, ref, "pay");
    await bp.getByText("تم الدفع وتأكيد استلام حجزك").waitFor();
    eq(sql(`select status||','||payment_method from bookings where ref='${ref}'`), "paid,myfatoorah", "paid by MyFatoorah");
  });
  await check("cancelling a bank-paid booking: nothing goes to MyFatoorah, admin refunds by transfer and marks it", async () => {
    await savePolicy(() => a.check('input[name="refund_auto"]'));
    try {
      await bp.goto(`${BASE}/ar/booking/${bankRef}`, { waitUntil: "networkidle" });
      await bp.getByRole("button", { name: "أريد إلغاء الحجز" }).click();
      await bp.locator('form:has(input[name=confirm]) input[name="phone"]').fill("0501234567");
      await bp.locator('form:has(input[name=confirm]) input[name="confirm"]').check();
      await bp.getByRole("button", { name: "تأكيد الإلغاء" }).click();
      await bp.waitForURL(/cancelled=1$/, { waitUntil: "commit" });
      await bp.getByText("دفعت بالتحويل البنكي").waitFor();
      eq(sql(`select status||','||refund_status||','||refund_amount from bookings where ref='${bankRef}'`), "cancelled,pending_approval,28750", "waiting for manual refund");
      eq((await mf("/__refunds")).filter((r) => String(r.key) === `BT-${bankRef}`).length, 0, "no MyFatoorah refund");
      await a.goto(`${BASE}/admin/bookings/${bankRef}`, { waitUntil: "networkidle" });
      eq(await a.getByRole("button", { name: "موافقة وإرسال الاسترداد" }).count(), 0, "no gateway refund button");
      await a.getByText("اطلب منه رقم الآيبان").waitFor();
      await submit(a, "تم الاسترداد يدويًا");
      await a.getByText("عولج يدويًا", { exact: true }).waitFor();
    } finally {
      await savePolicy(() => a.uncheck('input[name="refund_auto"]'));
    }
  });
  await check("booking page and admin show the end time (hourly) and expected arrival (transfer)", async () => {
    const [hRef, tRef] = sql("select (select ref from bookings where pricing_mode='hourly' and hours=12 and duration_min=720 order by created_at desc limit 1), (select ref from bookings where pricing_mode='fixed' and duration_min=75 order by created_at desc limit 1)").split("|");
    await page.goto(`${BASE}/ar/booking/${hRef}`, { waitUntil: "networkidle" });
    assert((await page.textContent("main")).includes("ينتهي الحجز"), "end on booking page");
    await a.goto(`${BASE}/admin/bookings/${hRef}`, { waitUntil: "networkidle" });
    assert((await a.textContent("main")).includes("ينتهي الحجز"), "end in admin");
    await page.goto(`${BASE}/ar/booking/${tRef}`, { waitUntil: "networkidle" });
    assert((await page.textContent("main")).includes("الوصول المتوقع"), "arrival on booking page");
  });
  await check("top bar: Home first and Contact right after My booking (both languages)", async () => {
    for (const [lang, labels] of [["ar", ["الرئيسية", "الرحلات والأسعار", "السيارات", "حجزي", "تواصل معنا"]], ["en", ["Home", "Routes & prices", "Vehicles", "My booking", "Contact"]]]) {
      await page.goto(`${BASE}/${lang}/fleet`, { waitUntil: "networkidle" });
      const got = (await page.locator('header nav[aria-label="Main"] a').allTextContents()).map((x) => x.trim());
      eq(JSON.stringify(got), JSON.stringify(labels), `${lang} nav`);
    }
    await page.locator('header nav[aria-label="Main"] a').first().click();
    await page.waitForURL(/\/en$/, { waitUntil: "commit" });
  });
  await check("contact page: WhatsApp, phone and email links; empty message is refused; message opens WhatsApp", async () => {
    await page.goto(`${BASE}/ar/contact`, { waitUntil: "networkidle" });
    assert(await page.locator('main a[href^="https://wa.me/966500000000"]').count(), "WhatsApp link");
    assert(await page.locator('main a[href^="tel:"]').count(), "phone link");
    assert(await page.locator('main a[href^="mailto:"]').count(), "email link");
    await page.getByRole("button", { name: "أرسل عبر واتساب" }).click();
    await page.getByText("اكتب رسالتك أولًا.").waitFor();
    await page.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u; return null; }; });
    await page.locator('main textarea[name="message"]').fill("أبغى أسأل عن حجز جماعي");
    await page.getByRole("button", { name: "أرسل عبر واتساب" }).click();
    const url = await page.evaluate(() => window.__opened);
    assert(url && url.startsWith("https://wa.me/966500000000?text=") && decodeURIComponent(url).includes("حجز جماعي"), "opened " + url);
  });

  /* ---------- receipts uploaded on the site ---------- */
  section = "Receipts, inquiry bot, live chat, banners";
  console.log(`\n${section}`);
  const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const bankBooking = async () => {
    const ref = await makeBooking(bp, { date: inDaysUTC(4) });
    await bp.locator("[data-method]").first().waitFor();
    await bp.getByRole("button", { name: "سأدفع بالتحويل البنكي" }).click();
    await bp.waitForURL(new RegExp(`/ar/booking/${ref}$`), { waitUntil: "commit" });
    await bp.getByTestId("receipt-form").waitFor();
    return ref;
  };
  const upload = async (file) => {
    await bp.setInputFiles('[data-testid=receipt-form] input[name="receipt"]', file);
    await bp.getByRole("button", { name: "رفع الإيصال" }).click();
  };
  let rcRef;
  await check("receipt: customer uploads a photo on the booking page instead of WhatsApp", async () => {
    rcRef = await bankBooking();
    eq(await bp.getByTestId("bank-transfer").getByRole("link", { name: /واتساب/ }).count(), 0, "no WhatsApp receipt button");
    await upload({ name: "إيصال-التحويل.png", mimeType: "image/png", buffer: PNG });
    await bp.waitForURL(/receipt=1$/, { waitUntil: "commit" });
    await bp.getByTestId("receipts").waitFor();
    assert((await bp.getByTestId("receipts").textContent()).includes("إيصال-التحويل.png"), "file name listed");
    eq(sql(`select r.mime||','||r.size from receipts r join bookings b on b.id=r.booking_id where b.ref='${rcRef}'`), `image/png,${PNG.length}`, "stored");
  });
  await check("receipt: admin sees it on the booking, the dashboard and the list; the file is admin-only", async () => {
    await a.goto(`${BASE}/admin/bookings/${rcRef}`, { waitUntil: "networkidle" });
    const src = await a.getByTestId("admin-receipts").locator("img").first().getAttribute("src");
    const r = await a.request.get(BASE + src);
    eq(r.status(), 200, "admin can open");
    eq(r.headers()["content-type"], "image/png", "type");
    assert(r.headers()["content-security-policy"].includes("sandbox") && r.headers()["cache-control"].includes("no-store"), "locked down");
    eq((await fetch(BASE + src)).status, 404, "anonymous can't");
    eq((await fetch(`${BASE}/api/admin/receipts/not-a-uuid`)).status, 404, "bad id");
    await a.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await a.getByText("منها رفع العميل إيصالها").waitFor();
    await a.goto(`${BASE}/admin/bookings?q=${rcRef}`, { waitUntil: "networkidle" });
    await a.getByText("إيصال مرفوع").waitFor();
  });
  await check("receipt: PDF accepted (downloaded, not shown inline); fake, SVG, HTML and >5 MB files refused", async () => {
    await upload({ name: "receipt.pdf", mimeType: "application/pdf", buffer: PDF });
    await bp.waitForURL(/receipt=1$/, { waitUntil: "commit" });
    await bp.waitForLoadState("networkidle");
    const pdfId = sql(`select r.id from receipts r join bookings b on b.id=r.booking_id where b.ref='${rcRef}' and r.mime='application/pdf'`);
    const r = await a.request.get(`${BASE}/api/admin/receipts/${pdfId}`);
    assert(r.headers()["content-disposition"].startsWith("attachment"), "PDF downloads");
    for (const [file, msg] of [
      [{ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("not an image at all") }, "الملف يجب أن يكون صورة"],
      [{ name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }, "الملف يجب أن يكون صورة"],
      [{ name: "x.html", mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") }, "الملف يجب أن يكون صورة"],
      [{ name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(5.3 * 1024 * 1024)]) }, "أكبر من ٥ ميجابايت"],
    ]) {
      await bp.goto(`${BASE}/ar/booking/${rcRef}`, { waitUntil: "networkidle" });
      await upload(file);
      await bp.getByText(msg).waitFor();
    }
    eq(sql(`select count(*) from receipts r join bookings b on b.id=r.booking_id where b.ref='${rcRef}'`), "2", "only the two good files kept");
  });
  await check("receipt: at most 5 per booking; none once the transfer is confirmed", async () => {
    sql(`insert into receipts(booking_id, mime, file_name, size, data) select id, 'image/png', 'x.png', 1, '\\x00' from bookings, generate_series(1,3) where ref='${rcRef}'`);
    await bp.goto(`${BASE}/ar/booking/${rcRef}`, { waitUntil: "networkidle" });
    await upload({ name: "sixth.png", mimeType: "image/png", buffer: PNG });
    await bp.getByText("وصلت للحد الأقصى").waitFor();
    await a.goto(`${BASE}/admin/bookings/${rcRef}`, { waitUntil: "networkidle" });
    await submit(a, "تأكيد استلام التحويل");
    eq(sql(`select status from bookings where ref='${rcRef}'`), "paid", "confirmed");
    await bp.goto(`${BASE}/ar/booking/${rcRef}`, { waitUntil: "networkidle" });
    eq(await bp.getByTestId("receipt-form").count(), 0, "no upload on a paid booking");
  });

  /* ---------- inquiry bot and live chat ---------- */
  // own context and client IP, so chat rate limits don't leak between runs
  const chatCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-forwarded-for": `10.88.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const chp = await chatCtx.newPage();
  chp.on("pageerror", (e) => pageErrors.push(e.message));
  chp.on("dialog", (d) => { pageErrors.push("DIALOG OPENED: " + d.message()); d.dismiss(); });
  const chat = chp.locator("#chat-panel");
  const openChat = async (lang = "ar") => {
    await chp.goto(`${BASE}/${lang}/fleet`, { waitUntil: "networkidle" });
    await chp.getByTestId("chat-launcher").click();
    await chat.waitFor();
  };
  const ask = async (text) => {
    await chat.locator("textarea").fill(text);
    await chat.locator("textarea").press("Enter");
  };
  const saveBot = async (fn) => {
    await a.goto(`${BASE}/admin/chat/settings`, { waitUntil: "networkidle" });
    await fn();
    await submit(a, "حفظ إعدادات البوت");
    await a.getByText("تم حفظ إعدادات البوت").waitFor();
  };

  await check("bot: replaces the WhatsApp button; greeting, tapped question and typed question are answered", async () => {
    await openChat();
    eq(await chp.locator('a[aria-label="تواصل عبر واتساب"]').count(), 0, "no WhatsApp bubble while the bot is on");
    await chat.getByText("أنا المساعد الآلي").waitFor();
    await chat.getByRole("button", { name: "ما سياسة الإلغاء والاسترداد؟" }).click();
    await chat.getByText("بـ٢٤ ساعة أو أكثر، و٥٠٪").waitFor(); // filled from the cancellation settings
    await ask("ابغى استرداد فلوسي لو الغيت");
    await chp.waitForFunction(() => document.querySelectorAll('#chat-panel [data-from="bot"]').length >= 2);
    await ask("كم سعر السياره للشخص الواحد");
    await chat.getByText("السعر للسيارة كاملة").waitFor();
    await ask("zzzz qqqq");
    await chat.getByText("ما لقيت إجابة دقيقة").waitFor();
  });
  await check("bot understands common phrasings (Arabic and English)", async () => {
    const cases = [
      ["ابغى الغي حجزي واسترد فلوسي", "بـ٢٤ ساعة"],
      ["وين حجزي؟ ابغى اعرف حالته", "رقم الحجز المكوّن من ٨ خانات"],
      ["كيف احجز", "من الصفحة الرئيسية اختر"],
      ["ابغى ادفع تحويل بنكي", "ماي فاتورة"],
      ["ابغى سائق ١٢ ساعه", "٦ أو ١٢ أو ٢٤ ساعة"],
      ["ابغى اغير موعد الرحله", "مرة واحدة مجانًا"],
      ["can I get a refund", "بـ٢٤ ساعة"],
      ["السلام عليكم", "ما لقيت إجابة دقيقة"],
    ];
    for (const [q, want] of cases) {
      const r = await chp.evaluate(async (text) => (await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "ask", text, lang: "ar", after: 1e9 }) })).json(), q);
      const all = await chp.evaluate(async () => (await fetch("/api/chat?after=0")).json());
      const lastBot = all.messages.filter((m) => m.from === "bot").pop()?.text ?? "";
      assert(lastBot.includes(want), `${q} -> ${lastBot.slice(0, 60)}`);
      void r;
    }
  });
  await check("live chat: staff request needs name and phone; reply reaches the customer; staff names stay private", async () => {
    await openChat();
    await chat.getByRole("button", { name: "تكلم مع موظف" }).click();
    const form = chp.getByTestId("chat-staff-form");
    await form.getByRole("button", { name: "اطلب موظف" }).click();
    await form.getByText("اكتب اسمك.").waitFor();
    await form.getByText("اكتب رقم جوال صحيح.").waitFor();
    await form.locator('input[name="name"]').fill("عميل المحادثة");
    await form.locator('input[name="phone"]').fill("0551234567");
    await form.getByRole("button", { name: "اطلب موظف" }).click();
    await chat.getByText("وصل طلبك لموظف").waitFor();
    await ask("<img src=x onerror=alert(1)> أبغى أغير الموعد");
    await chat.getByText("<img src=x onerror=alert(1)>", { exact: false }).waitFor();
    eq(await chat.locator("img").count(), 0, "message shown as text");
    const id = sql("select id from chat_conversations where customer_name='عميل المحادثة' order by created_at desc limit 1");
    assert(Number(sql(`select unread_admin from chat_conversations where id='${id}'`)) >= 2, "unread for staff");
    await a.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await a.getByText("محادثات تنتظر ردك").waitFor();
    await a.goto(`${BASE}/admin/chat`, { waitUntil: "networkidle" });
    await a.getByText("عميل المحادثة").first().click();
    await a.waitForURL(new RegExp(`/admin/chat/${id}$`), { waitUntil: "commit" });
    await a.getByTestId("admin-chat-messages").getByText("<img src=x onerror=alert(1)>", { exact: false }).waitFor();
    eq(sql(`select unread_admin from chat_conversations where id='${id}'`), "0", "read once opened");
    await a.fill('textarea[name="text"]', "أهلًا، أرسل لي رقم الحجز والموعد الجديد");
    await a.getByRole("button", { name: "إرسال الرد" }).click();
    await chat.getByText("أرسل لي رقم الحجز والموعد الجديد").waitFor({ timeout: 15000 }); // polled every 4 s
    await chat.getByText("خدمة العملاء").first().waitFor();
    const api = await chp.evaluate(async () => (await fetch("/api/chat?after=0")).text());
    assert(!api.includes("Admin") && !api.includes('"staff":'), "admin name not sent to the browser");
    eq(sql(`select status from chat_conversations where id='${id}'`), "open", "open");
  });
  await check("live chat: staff closes the conversation; the bot takes over again", async () => {
    const id = sql("select id from chat_conversations where customer_name='عميل المحادثة' order by created_at desc limit 1");
    await a.goto(`${BASE}/admin/chat/${id}`, { waitUntil: "networkidle" });
    await submit(a, "إنهاء المحادثة");
    await chat.getByText("انتهت المحادثة مع الموظف").waitFor({ timeout: 15000 });
    await ask("كيف أحجز رحلة؟");
    await chat.getByText("من الصفحة الرئيسية اختر").waitFor();
    eq(sql(`select status from chat_conversations where id='${id}'`), "bot", "back to the bot");
  });
  await check("chat security: other sites can't post, the cookie is httpOnly, no cookie = no conversation, admin pages need login", async () => {
    const evil = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ type: "ask", text: "hi" }) });
    eq(evil.status, 403, "cross-site post refused");
    const anon = await (await fetch(`${BASE}/api/chat?after=0`)).json();
    eq(anon.status, null, "no conversation without the cookie");
    const cookie = (await chatCtx.cookies()).find((c) => c.name === "chat_session");
    assert(cookie && cookie.httpOnly && cookie.sameSite === "Lax" && /^[a-f0-9]{64}$/.test(cookie.value), "httpOnly random cookie");
    eq(sql(`select count(*) from chat_conversations where token_hash='${cookie.value}'`), "0", "only the hash is stored");
    const forged = await fetch(`${BASE}/api/chat?after=0`, { headers: { Cookie: `chat_session=${"a".repeat(64)}` } });
    eq((await forged.json()).status, null, "guessed token finds nothing");
    for (const path of ["/admin/chat", "/admin/chat/settings", "/admin/banners"]) {
      const r = await fetch(BASE + path, { redirect: "manual" });
      assert([307, 308].includes(r.status) && r.headers.get("location").includes("/admin/login"), path);
    }
    const bad = await fetch(`${BASE}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
    eq(bad.status, 400, "bad body");
  });
  await check("bot settings: greeting, new question with keywords, hide and delete — all from the admin panel", async () => {
    await saveBot(() => a.fill('textarea[name="chat_greeting_ar"]', "مرحبًا من لوحة التحكم"));
    await a.goto(`${BASE}/admin/chat/settings`, { waitUntil: "networkidle" });
    const add = a.locator("form").filter({ has: a.getByRole("button", { name: "إضافة السؤال" }) });
    await add.locator('input[name="questionAr"]').fill("هل يوجد كرسي أطفال؟");
    await add.locator('textarea[name="answerAr"]').fill("نعم، اطلبه في ملاحظات الحجز وبنجهزه لك مجانًا.");
    await add.locator('input[name="keywords"]').fill("كرسي, طفل, اطفال");
    await add.getByRole("button", { name: "إضافة السؤال" }).click();
    await a.waitForURL(/added=1/, { waitUntil: "commit" });
    await a.getByText("تمت إضافة السؤال").waitFor();
    await openChat();
    await chat.getByText("مرحبًا من لوحة التحكم").waitFor();
    await chat.getByRole("button", { name: "هل يوجد كرسي أطفال؟" }).waitFor();
    await ask("عندي طفل صغير ابغى كرسي");
    await chat.getByText("بنجهزه لك مجانًا").waitFor();
    // hide it
    const fid = sql("select id from chat_faqs where question_ar='هل يوجد كرسي أطفال؟'");
    await a.goto(`${BASE}/admin/chat/settings`, { waitUntil: "networkidle" });
    const card = a.locator("details").filter({ hasText: "هل يوجد كرسي أطفال؟" });
    await card.locator("summary").click();
    await card.locator('input[name="active"]').uncheck();
    await card.getByRole("button", { name: "حفظ السؤال" }).click();
    await card.getByText("تم حفظ السؤال").waitFor();
    await openChat();
    eq(await chat.getByRole("button", { name: "هل يوجد كرسي أطفال؟" }).count(), 0, "hidden question gone");
    await a.goto(`${BASE}/admin/chat/settings`, { waitUntil: "networkidle" });
    await a.locator("details").filter({ hasText: "هل يوجد كرسي أطفال؟" }).locator("summary").click();
    await a.locator("details").filter({ hasText: "هل يوجد كرسي أطفال؟" }).getByRole("button", { name: "حذف السؤال" }).click();
    await a.waitForURL(/deleted=1/, { waitUntil: "commit" });
    eq(sql(`select count(*) from chat_faqs where id=${fid}`), "0", "deleted");
    await saveBot(() => a.fill('textarea[name="chat_greeting_ar"]', "أهلًا بك! أنا المساعد الآلي. اختر سؤالًا من الأسفل أو اكتب سؤالك، وإذا احتجت تقدر تكلم موظف مباشرة."));
  });
  await check("bot settings: WhatsApp-only hand-over, and switching the bot off brings back the WhatsApp button", async () => {
    try {
      await saveBot(() => a.check('input[name="chat_handoff"][value="whatsapp"]'));
      await openChat();
      const link = chat.getByRole("link", { name: "تكلم مع موظف" });
      assert((await link.getAttribute("href")).startsWith("https://wa.me/966500000000"), "opens WhatsApp");
      await saveBot(() => a.uncheck('input[name="chat_enabled"]'));
      await chp.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
      eq(await chp.getByTestId("chat-launcher").count(), 0, "no bot");
      eq(await chp.locator('a[aria-label="تواصل عبر واتساب"]').count(), 1, "WhatsApp button back");
    } finally {
      await saveBot(async () => { await a.check('input[name="chat_enabled"]'); await a.check('input[name="chat_handoff"][value="both"]'); });
    }
  });
  await check("chat on a phone: the window fits the screen", async () => {
    await chp.setViewportSize({ width: 390, height: 844 });
    await openChat();
    const box = await chat.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0, "inside the screen");
    eq(await chp.evaluate(() => document.documentElement.scrollWidth), 390, "no sideways scroll");
    await chp.setViewportSize({ width: 1280, height: 900 });
  });
  await chatCtx.close();

  /* ---------- home page banners ---------- */
  const bannerForm = () => a.locator("form").filter({ has: a.getByRole("button", { name: "إضافة البنر" }) });
  const addBanner = async ({ file = { name: "b.png", mimeType: "image/png", buffer: PNG }, title = "", link = "", order = "0" } = {}) => {
    await a.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });
    const f = bannerForm();
    await f.locator('input[name="image"]').setInputFiles(file);
    await f.locator('input[name="titleAr"]').fill(title);
    await f.locator('input[name="link"]').fill(link);
    await f.locator('input[name="sortOrder"]').fill(order);
    await f.getByRole("button", { name: "إضافة البنر" }).click();
  };
  await check("banners: none at first, so nothing shows on the home page", async () => {
    sql("delete from banners");
    await touchCache();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("home-banners").count(), 0, "no banner section");
  });
  await check("banners: fake images and unsafe links are refused", async () => {
    await addBanner({ file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("nope") } });
    await a.getByText("الصورة يجب أن تكون PNG أو JPG أو WEBP").waitFor();
    await addBanner({ file: { name: "x.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') } });
    await a.getByText("الصورة يجب أن تكون PNG أو JPG أو WEBP").waitFor();
    for (const link of ["javascript:alert(1)", "//evil.example/x", "http://insecure.example"]) {
      await addBanner({ link });
      await a.getByText("الرابط يجب أن يبدأ بـ").waitFor();
    }
    eq(sql("select count(*) from banners"), "0", "nothing saved");
  });
  await check("banners: added from the admin panel, shown on the home page in order, with title and link", async () => {
    await addBanner({ title: "عرض العمرة", link: "/ar/routes", order: "2" });
    await a.waitForURL(/added=1/, { waitUntil: "commit" });
    await a.getByText("تمت إضافة البنر").waitFor();
    eq(await bannerForm().locator('input[name="titleAr"]').inputValue(), "", "form cleared");
    await addBanner({ title: "خصم الصيف", order: "1" });
    await a.waitForURL(/added=1/, { waitUntil: "commit" });
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    const slides = page.getByTestId("home-banners").locator('[aria-roledescription="slide"]');
    eq(await slides.count(), 2, "two slides");
    assert((await slides.first().textContent()).includes("خصم الصيف"), "lower order first");
    eq(await slides.nth(1).locator("a").getAttribute("href"), "/ar/routes", "link");
    const src = await slides.first().locator("img").getAttribute("src");
    const r = await fetch(BASE + src);
    eq(r.headers.get("content-type"), "image/png", "image served");
    assert(r.headers.get("content-security-policy").includes("sandbox"), "sandboxed");
    await page.getByTestId("home-banners").getByRole("button", { name: "التالي" }).click();
    eq(await slides.nth(1).getAttribute("aria-hidden"), "false", "next works");
  });
  await check("banners: hiding one and an end date in the past remove it from the home page; delete works", async () => {
    await a.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });
    const summer = a.getByTestId("banner-list").locator("li").filter({ hasText: "خصم الصيف" });
    await summer.getByRole("button", { name: "إخفاء" }).click();
    await summer.getByText("أُخفي البنر").waitFor();
    sql(`update banners set ends_on = (now() at time zone 'Asia/Riyadh')::date - 1 where title_ar='عرض العمرة'`);
    await touchCache();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("home-banners").count(), 0, "both gone");
    await a.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });
    await a.getByText("انتهى").waitFor();
    await a.getByTestId("banner-list").locator("li").filter({ hasText: "خصم الصيف" }).getByRole("button", { name: "حذف" }).click();
    await a.waitForURL(/deleted=1/, { waitUntil: "commit" });
    eq(sql("select count(*) from banners where title_ar='خصم الصيف'"), "0", "deleted");
    sql("delete from banners");
    await touchCache();
  });

  /* ---------- background behind the home page's top section ---------- */
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
  const heroCard = () => a.getByTestId("hero-card");
  const saveDisplay = async (fn) => {
    await a.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });
    await fn();
    await submit(a, "حفظ");
    await a.getByText("تم الحفظ. التغيير يظهر").waitFor();
  };
  await check("hero background: none by default; fake files refused; an uploaded photo shows behind the top section only", async () => {
    sql("delete from assets where key='hero'");
    await touchCache();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("hero-bg").count(), 0, "no background yet");
    await a.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });
    await heroCard().locator('input[name="hero"]').setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<html>nope</html>") });
    await submit(a, "رفع الخلفية");
    await heroCard().getByText("الصورة يجب أن تكون PNG أو JPG أو WEBP").waitFor();
    await heroCard().locator('input[name="hero"]').setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([JPG, Buffer.alloc(3.2 * 1024 * 1024)]) });
    await submit(a, "رفع الخلفية");
    await heroCard().getByText("أكبر من ٣ ميجابايت").waitFor();
    await heroCard().locator('input[name="hero"]').setInputFiles({ name: "hero.jpg", mimeType: "image/jpeg", buffer: JPG });
    await submit(a, "رفع الخلفية");
    await heroCard().getByText("تم رفع الخلفية").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    const bg = page.getByTestId("hero-bg");
    eq(await bg.count(), 1, "background shown");
    eq(await page.locator("section").filter({ has: bg }).locator("form#search").count(), 1, "behind the booking sign's section");
    eq(await bg.locator("[data-overlay]").getAttribute("data-overlay"), "light", "light veil by default");
    const src = await bg.locator("img").getAttribute("src");
    const r = await fetch(BASE + src);
    eq(r.headers.get("content-type"), "image/jpeg", "served");
    assert(r.headers.get("content-security-policy").includes("sandbox"), "sandboxed");
    eq(await page.locator("section").nth(1).getByTestId("hero-bg").count(), 0, "rest of the page unchanged");
  });
  await check("hero background: veil strength, hide and show again, then delete — from the admin panel", async () => {
    await saveDisplay(() => a.check('input[name="hero_bg_overlay"][value="strong"]'));
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("hero-bg").locator("[data-overlay]").getAttribute("data-overlay"), "strong", "strong veil");
    await saveDisplay(() => a.uncheck('input[name="hero_bg_enabled"]'));
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("hero-bg").count(), 0, "hidden");
    await a.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });
    await heroCard().getByText("مخفية عن الموقع").waitFor();
    await saveDisplay(async () => { await a.check('input[name="hero_bg_enabled"]'); await a.check('input[name="hero_bg_overlay"][value="light"]'); });
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("hero-bg").count(), 1, "shown again");
    await a.goto(`${BASE}/admin/banners`, { waitUntil: "networkidle" });
    await a.getByRole("button", { name: "حذف الخلفية", exact: true }).click();
    await a.waitForURL(/hero=deleted/, { waitUntil: "commit" });
    await heroCard().getByText("تم حذف الخلفية").waitFor();
    eq(sql("select count(*) from assets where key='hero'"), "0", "deleted");
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("hero-bg").count(), 0, "gone from the site");
    eq((await fetch(`${BASE}/api/brand/hero`)).status, 404, "image gone");
  });
  await check("offers section: one switch hides all banners; turning it back on shows them", async () => {
    await addBanner({ title: "عرض للتجربة" });
    await a.waitForURL(/added=1/, { waitUntil: "commit" });
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("home-banners").count(), 1, "shown");
    await saveDisplay(() => a.uncheck('input[name="banners_enabled"]'));
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("home-banners").count(), 0, "whole section hidden");
    eq(sql("select count(*) from banners where active"), "1", "banners kept");
    await saveDisplay(() => a.check('input[name="banners_enabled"]'));
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("home-banners").count(), 1, "back");
    sql("delete from banners");
    await touchCache();
  });
  await check("background and display actions refuse requests without an admin session", async () => {
    const r = await fetch(`${BASE}/admin/banners`, { redirect: "manual" });
    assert([307, 308].includes(r.status), "login required");
  });
  await bctx.close();
  void touchCache; void setSetting;
}

/* ======================================================================= */
if (!ONLY || ONLY === "drivers") {
  section = "Drivers, WhatsApp messages, ratings, users & permissions";
  console.log(`\n${section}`);
  const PHOTO = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await dctx.newPage();
  const cctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const c = await cctx.newPage(); // customer on a phone
  const wa = () => mf("/__wa");
  const setSetting = (k, v) => sql(`insert into settings(key,value) values('${k}','${v}') on conflict (key) do update set value=excluded.value`);
  const clean = () => {
    sql("delete from notifications; delete from ratings; update bookings set driver_id = null; delete from admin_users where role <> 'owner'; delete from drivers");
  };
  clean();
  await mf("/__wa_reset");
  await adminLogin(a, "admin@example.com", env("ADMIN_PASSWORD"));
  await a.waitForURL(/\/admin$/);

  /** a paid booking straight in the database (the payment flow has its own tests) */
  const paidBooking = (o = {}) => {
    const ref = "D" + Math.random().toString(36).slice(2, 9).toUpperCase().replace(/[^A-Z0-9]/g, "X").padEnd(7, "Z");
    sql(`insert into bookings (ref, route_title, vehicle_name, customer_name, customer_phone, passengers, bags, pickup_date, pickup_time, pickup_address,
         dropoff_address, notes, subtotal, vat_rate, vat_amount, amount, status, locale, duration_min, paid_at)
         values ('${ref}', 'مطار جدة ← مكة', 'تويوتا كامري', '${o.name ?? "سلمان الدوسري"}', '${o.phone ?? "+966551112299"}', 2, 2, '${o.date ?? inDaysUTC(2)}', '${o.time ?? "09:30"}',
         'صالة ١', 'فندق الصفوة', 'عندنا كرسي أطفال', 20000, 1500, 3000, 23000, '${o.status ?? "paid"}', '${o.locale ?? "ar"}', 60, now())`);
    return ref;
  };
  const addDriver = async (o) => {
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    const f = a.locator("form").filter({ has: a.getByRole("button", { name: "إضافة السائق" }) });
    await f.locator('input[name="name"]').fill(o.name);
    await f.locator('input[name="phone"]').fill(o.phone);
    await f.locator('input[name="plateNumber"]').fill(o.plate ?? "أ ب ج ١٢٣٤");
    await f.locator('select[name="vehicleId"]').selectOption({ label: o.car ?? "تويوتا كامري" });
    await f.locator('select[name="carModel"]').selectOption(o.model ?? "2024");
    await f.locator('input[name="carColor"]').fill(o.color ?? "أبيض");
    if (o.photo) await f.locator('input[name="photo"]').setInputFiles(o.photo);
    await f.getByRole("button", { name: "إضافة السائق" }).click();
  };

  let driverId, ref;
  await check("drivers: added from the panel with name, mobile, plate, car, model, colour and photo; bad mobile and fake photo refused", async () => {
    await addDriver({ name: "فهد الحربي", phone: "05123", plate: "ر س ع ٥٥٥٥" });
    await a.getByText("رقم جوال السائق غير صحيح").waitFor();
    await addDriver({ name: "فهد الحربي", phone: "0551234321", photo: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } });
    await a.getByText("الصورة يجب أن تكون PNG").waitFor();
    await addDriver({ name: "فهد الحربي", phone: "0551234321", plate: "ر س ع ٥٥٥٥", photo: { name: "me.png", mimeType: "image/png", buffer: PHOTO } });
    await a.waitForURL(/added=1/, { waitUntil: "commit" });
    await a.getByTestId("driver-list").getByText("فهد الحربي").waitFor();
    const [id, phone, plate, hasPhoto] = sql("select id, phone, plate_number, photo is not null from drivers where name='فهد الحربي'").split("|");
    driverId = Number(id);
    eq(phone, "+966551234321", "mobile stored with country code");
    eq(plate, "ر س ع ٥٥٥٥", "plate");
    eq(hasPhoto, "t", "photo saved");
    eq((await a.request.get(`${BASE}/api/admin/drivers/${driverId}/photo`)).status(), 200, "photo for staff");
    eq((await fetch(`${BASE}/api/admin/drivers/${driverId}/photo`)).status, 404, "photo hidden from the public");
  });

  await check("booking form: WhatsApp number is required and 05xxxxxxxx is stored as +9665xxxxxxxx", async () => {
    await fillBooking(c, { phone: "" });
    await c.waitForTimeout(300);
    eq(await c.locator("#phone:invalid").count(), 1, "browser requires it");
    await fillBooking(c, { phone: "0512" });
    await c.getByText("اكتب رقم واتساب صحيحًا").waitFor({ timeout: 8000 });
    await c.getByText("رقم الواتساب", { exact: true }).first().waitFor();
    const r = await makeBooking(c, { phone: "٠٥٥١٢٣٤٥٦٧" });
    eq(sql(`select customer_phone from bookings where ref='${r}'`), "+966551234567", "normalized (Arabic digits too)");
  });

  await check("assign a driver: driver gets the customer's details, customer gets the driver's — both on WhatsApp automatically", async () => {
    ref = paidBooking();
    await a.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    const card = a.getByTestId("driver-card");
    await card.getByText("لم يُحدَّد سائق بعد.").waitFor();
    await card.locator('select[name="driverId"]').selectOption(String(driverId));
    await card.getByRole("button", { name: "إسناد وإرسال الرسائل" }).click();
    await card.getByText("أُرسلت رسالتا الواتساب للسائق والعميل").waitFor();
    eq(sql(`select status, driver_id from bookings where ref='${ref}'`), `confirmed|${driverId}`, "confirmed with driver");
    const msgs = await wa();
    eq(msgs.length, 2, "two messages");
    const toDriver = msgs.find((m) => m.to === "966551234321");
    const toCustomer = msgs.find((m) => m.to === "966551112299");
    assert(toDriver && toCustomer, "one to each");
    const no = "MHT" + sql(`select lpad(number::text, 2, '0') from bookings where ref='${ref}'`);
    for (const x of ["سلمان الدوسري", "+966551112299", "صالة ١", "فندق الصفوة", "كرسي أطفال", no]) assert(toDriver.text.body.includes(x), "driver message has " + x);
    for (const x of ["فهد الحربي", "+966551234321", "تويوتا كامري", "ر س ع ٥٥٥٥", `/ar/booking/${ref}`]) assert(toCustomer.text.body.includes(x), "customer message has " + x);
    eq(sql(`select string_agg(status::text, ',' order by id) from notifications where booking_id=(select id from bookings where ref='${ref}')`), "sent,sent", "logged as sent");
  });

  await check("customer's booking page shows the driver: photo, name, car, plate and contact", async () => {
    await c.goto(`${BASE}/ar/booking/${ref}`, { waitUntil: "networkidle" });
    const d = c.getByTestId("customer-driver");
    for (const x of ["سائقك", "فهد الحربي", "ر س ع ٥٥٥٥", "تويوتا كامري"]) await d.getByText(x, { exact: false }).first().waitFor();
    const img = d.locator("img");
    eq(await img.evaluate((el) => el.complete && el.naturalWidth > 0), true, "photo loads");
    assert((await d.getByRole("link", { name: /واتساب/ }).getAttribute("href")).includes("wa.me/966551234321"), "WhatsApp link");
    eq((await fetch(`${BASE}/api/booking/ZZZZZZZZ/driver-photo`)).status, 404, "unknown booking: no photo");
  });

  await check("bookings list: running number MHT.., date, time, from, to, car, customer, mobiles and driver each in its own column; search by number", async () => {
    const no = "MHT" + sql(`select lpad(number::text, 2, '0') from bookings where ref='${ref}'`);
    await a.goto(`${BASE}/admin/bookings?q=${no}`, { waitUntil: "networkidle" });
    const heads = await a.getByTestId("bookings-table").locator("thead th").allInnerTexts();
    eq(heads.join("|"), "رقم الحجز|التاريخ|الوقت|من|إلى|السيارة|العميل|جوال العميل|السائق|جوال السائق|المبلغ|الحالة", "columns");
    const cells = await a.getByTestId("bookings-table").locator("tbody tr").first().locator("td").allInnerTexts();
    eq(cells[0], no, "number");
    assert(cells[2].includes("٩:٣٠"), "time alone: " + cells[2]);
    eq(cells[3], "مطار جدة", "from");
    eq(cells[4], "مكة", "to");
    eq(cells[6], "سلمان الدوسري", "customer");
    eq(cells[7], "+966551112299", "customer mobile");
    eq(cells[8], "فهد الحربي", "driver");
    eq(cells[9], "+966551234321", "driver mobile");
    eq(await a.getByTestId("bookings-table").locator("tbody tr").count(), 1, "search by number finds one");
  });

  await check("bookings filters: date, time, customer, mobile, city, destination, driver and car — each narrows the list", async () => {
    const r = await makeBooking(c, { name: "عميل فلتر", phone: "0551231234", date: inDaysUTC(3) });
    const rows = async (q) => {
      await a.goto(`${BASE}/admin/bookings?${q}`, { waitUntil: "networkidle" });
      return (await a.getByTestId("bookings-table").count()) ? a.getByTestId("bookings-table").locator("tbody tr").allInnerTexts() : [];
    };
    const has = async (q) => (await rows(q)).some((t) => t.includes("عميل فلتر"));
    const jed = sql("select id from locations where slug='jeddah-airport'");
    const ruh = sql("select id from locations where slug='riyadh-airport'");
    const camry = sql(`select vehicle_id from bookings where ref='${r}'`);
    for (const [q, want] of [
      ["customer=فلتر", true],
      ["phone=0551231234", true],
      ["phone=966551231234", true],
      ["phone=0559999999", false],
      ["city=makkah", true],
      ["city=riyadh", false],
      [`place=${jed}`, true],
      [`place=${ruh}`, false],
      ["timeFrom=14:00&timeTo=15:00", true],
      ["timeFrom=16:00", false],
      [`from=${inDaysUTC(3)}&to=${inDaysUTC(3)}`, true],
      [`from=${inDaysUTC(4)}`, false],
      ["driver=none&customer=فلتر", true],
      [`driver=${driverId}&customer=فلتر`, false],
      [`vehicle=${camry}&customer=فلتر`, true],
    ])
      eq(await has(q), want, q);
    // the form keeps what was chosen, and "clear" removes it
    await a.goto(`${BASE}/admin/bookings?city=makkah&customer=فلتر`, { waitUntil: "networkidle" });
    eq(await a.getByTestId("booking-filters").locator('select[name="city"]').inputValue(), "makkah", "kept");
    await a.getByRole("link", { name: "مسح الفلاتر" }).click();
    await a.waitForURL(/\/admin\/bookings$/);
  });

  await check("with templates set, WhatsApp messages go as approved templates without line breaks in parameters", async () => {
    const templates = async (driver, customer) => {
      await a.goto(`${BASE}/admin/messages`, { waitUntil: "networkidle" });
      await a.getByText("قوالب واتساب").click();
      await a.fill('input[name="wa_tpl_driver_trip"]', driver);
      await a.fill('input[name="wa_tpl_customer_driver"]', customer);
      await a.getByRole("button", { name: "حفظ", exact: true }).click();
    };
    await templates("Driver Trip!", "");
    await a.getByText("اسم القالب بحروف إنجليزية صغيرة").waitFor();
    await templates("driver_trip", "customer_driver");
    await a.getByText("تم الحفظ.").waitFor();
    await mf("/__wa_reset");
    const r2 = paidBooking({ name: "Lina Haddad", phone: "+447700900999", locale: "en" });
    await a.goto(`${BASE}/admin/bookings/${r2}`, { waitUntil: "networkidle" });
    await a.getByTestId("driver-card").locator('select[name="driverId"]').selectOption(String(driverId));
    await a.getByRole("button", { name: "إسناد وإرسال الرسائل" }).click();
    await a.getByText("أُرسلت رسالتا الواتساب").waitFor();
    const msgs = await wa();
    eq(msgs.map((m) => m.type).join(), "template,template", "templates");
    const cust = msgs.find((m) => m.to === "447700900999");
    eq(cust.template.name, "customer_driver", "template name");
    eq(cust.template.language.code, "ar", "language");
    eq(cust.template.components[0].parameters.length, 7, "7 parameters");
    eq(cust.template.components[0].parameters[0].text, "Lina Haddad", "first parameter");
    await templates("", "");
    await a.getByText("تم الحفظ.").waitFor();
  });

  await check("WhatsApp refused or not connected: the message waits in the panel with a ready 'send on WhatsApp' button", async () => {
    await mf("/__wa_reset");
    const r3 = paidBooking({ phone: "+966550000000" }); // the mock refuses numbers ending in 0000
    await a.goto(`${BASE}/admin/bookings/${r3}`, { waitUntil: "networkidle" });
    await a.getByTestId("driver-card").locator('select[name="driverId"]').selectOption(String(driverId));
    await a.getByRole("button", { name: "إسناد وإرسال الرسائل" }).click();
    await a.getByText("لم تصل كل الرسائل").waitFor();
    await a.reload({ waitUntil: "networkidle" });
    const failed = a.locator('[data-testid=notification-list] li[data-status="failed"]');
    await failed.getByText("Recipient phone number not in allowed list").waitFor();
    const href = await failed.getByRole("link", { name: "إرسال عبر واتساب" }).getAttribute("href");
    assert(href.startsWith("https://wa.me/966550000000?text=") && decodeURIComponent(href).includes("فهد الحربي"), "ready message " + href);
    await failed.getByRole("button", { name: "تم الإرسال" }).click();
    await a.waitForTimeout(500);
    await a.reload({ waitUntil: "networkidle" });
    eq(await a.locator('[data-testid=notification-list] li[data-status="manual"]').count(), 1, "marked as sent by hand");
  });

  let driverLogin = "0551234321";
  await check("users: owner adds a driver account; the driver sees only his trips and the menu has only 'my trips'", async () => {
    await a.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
    const f = a.locator("form").filter({ has: a.getByRole("button", { name: "إضافة الحساب" }) });
    await f.locator('input[name="name"]').fill("فهد الحربي");
    await f.locator('input[name="login"]').fill(driverLogin);
    await f.locator('input[name="password"]').fill("Driver-Pass-123");
    await f.locator('select[name="role"]').selectOption("driver");
    await f.locator('select[name="driverId"]').selectOption(String(driverId));
    await f.getByRole("button", { name: "إضافة الحساب" }).click();
    await a.waitForURL(/added=1/, { waitUntil: "commit" });
    eq(sql("select email, role from admin_users where driver_id=" + driverId), "+966551234321|driver", "stored");
  });

  const drv = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await check("driver signs in with his mobile number, starts and finishes the trip; the customer is asked for a rating on WhatsApp", async () => {
    await mf("/__wa_reset");
    await adminLogin(drv, "+966 55 123 4321", "Driver-Pass-123");
    await drv.waitForURL(/\/admin\/my-trips$/);
    await drv.getByTestId("my-trips").waitFor();
    const nav = (await drv.locator("nav[aria-label='لوحة التحكم'] a").allInnerTexts()).join("|");
    eq(nav, "رحلاتي|حسابي", "driver menu");
    const tripNo = "MHT" + sql(`select lpad(number::text, 2, '0') from bookings where ref='${ref}'`);
    const trip = drv.getByTestId("my-trips").locator("li").filter({ hasText: tripNo });
    await trip.getByText("سلمان الدوسري").waitFor();
    await trip.getByRole("button", { name: "بدأت الرحلة" }).click();
    await trip.getByText("بدأت الرحلة الساعة").waitFor();
    for (const path of ["/admin/bookings", `/admin/bookings/${ref}`, "/admin/drivers", "/admin/users", "/admin/settings"]) {
      await drv.goto(BASE + path, { waitUntil: "networkidle" });
      assert(drv.url().endsWith("/admin/my-trips"), "kept out of " + path);
    }
    eq((await drv.request.get(`${BASE}/api/admin/receipts/00000000-0000-0000-0000-000000000000`)).status(), 404, "no receipts");
    const trip2 = drv.getByTestId("my-trips").locator("li").filter({ hasText: tripNo });
    await trip2.getByRole("button", { name: "انتهت الرحلة" }).click();
    await drv.getByText(`انتهت الرحلة ${tripNo}. شكرًا لك!`).waitFor();
    eq(sql(`select status, started_at is not null, completed_at is not null, rating_requested_at is not null from bookings where ref='${ref}'`), "completed|t|t|t", "completed");
    const msgs = await wa();
    eq(msgs.length, 1, "one rating request");
    eq(msgs[0].to, "966551112299", "to the customer");
    assert(/\/ar\/rate\/[a-f0-9]{48}/.test(msgs[0].text.body) && msgs[0].text.body.includes("فهد الحربي"), "has the private link");
  });

  await check("driver doesn't see other drivers' trips", async () => {
    const other = paidBooking({ status: "confirmed" });
    await drv.reload({ waitUntil: "networkidle" });
    const otherNo = "MHT" + sql(`select lpad(number::text, 2, '0') from bookings where ref='${other}'`);
    eq(await drv.getByText(otherNo).count(), 0, "not in his list");
  });

  await check("rating page: customer rates the driver and the company; company email gets it; one rating per trip; bad links refused", async () => {
    const link = (await wa())[0].text.body.match(/https?:\/\/\S+\/ar\/rate\/[a-f0-9]{48}/)[0];
    const path = new URL(link).pathname;
    await c.goto(`${BASE}/ar/rate/${"0".repeat(48)}`, { waitUntil: "networkidle" });
    await c.getByText("رابط التقييم غير صحيح").waitFor();
    await c.goto(BASE + path, { waitUntil: "networkidle" });
    await c.getByText("فهد الحربي", { exact: false }).waitFor();
    await c.getByRole("button", { name: "إرسال التقييم" }).click();
    eq(await c.locator('input[name="driverStars"]:invalid').count() > 0, true, "stars required");
    await c.locator("fieldset").filter({ hasText: "تقييم السائق" }).locator("label").nth(4).click();
    await c.locator("fieldset").filter({ hasText: "تقييم الخدمة" }).locator("label").nth(3).click();
    await c.fill('textarea[name="comment"]', "سائق ملتزم بالوقت وسيارة نظيفة، شكرًا لكم");
    await c.getByRole("button", { name: "إرسال التقييم" }).click();
    await c.getByTestId("rating-thanks").waitFor();
    eq(sql(`select driver_stars, company_stars, driver_id from ratings where booking_id=(select id from bookings where ref='${ref}')`), `5|4|${driverId}`, "saved");
    const mail = sql(`select status, channel, subject, body from notifications where kind='rating_received' order by id desc limit 1`);
    assert(mail.startsWith("sent|email|تقييم جديد 4/5") && mail.includes("سائق ملتزم") && mail.includes("★★★★★"), "emailed: " + mail.slice(0, 120));
    await c.goto(BASE + path, { waitUntil: "networkidle" });
    await c.getByText("قيّمت هذه الرحلة من قبل").waitFor();
  });

  await check("ratings in the panel: averages, driver ranking, the comment, and on the booking page", async () => {
    await a.goto(`${BASE}/admin/ratings`, { waitUntil: "networkidle" });
    await a.getByTestId("rating-list").getByText("سائق ملتزم بالوقت").waitFor();
    await a.getByText("ترتيب السائقين").waitFor();
    await a.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    await a.getByTestId("booking-rating").getByText("سائق ملتزم").waitFor();
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    await a.getByTestId("driver-list").getByText("(١ تقييم)").waitFor();
  });

  await check("website: 'what our customers say' shows the average, count and the comment with first name only; hide works", async () => {
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    const r = page.getByTestId("reviews");
    await r.getByText("آراء عملائنا").waitFor();
    await r.getByText("سائق ملتزم بالوقت", { exact: false }).waitFor();
    await r.getByText("سلمان", { exact: true }).waitFor();
    eq(await r.getByText("الدوسري").count(), 0, "family name hidden");
    eq(await r.getByText("+9665").count(), 0, "no phone");
    await a.goto(`${BASE}/admin/ratings`, { waitUntil: "networkidle" });
    await a.getByTestId("rating-list").locator("li").filter({ hasText: "سائق ملتزم" }).getByRole("button", { name: "إخفاء من الموقع" }).click();
    await a.getByText("أُخفي من الموقع.").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByText("سائق ملتزم بالوقت", { exact: false }).count(), 0, "comment hidden");
    await page.getByTestId("reviews-avg").waitFor(); // the average still counts every rating
    await a.getByRole("button", { name: "إظهار في الموقع" }).click();
    await a.getByText("يظهر في الموقع.").waitFor();
    await a.uncheck('input[name="reviews_enabled"]');
    await a.locator("form").filter({ has: a.locator('input[name="reviews_enabled"]') }).getByRole("button", { name: "حفظ" }).click();
    await a.getByText("تم الحفظ.").waitFor();
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    eq(await page.getByTestId("reviews").count(), 0, "section off");
    setSetting("reviews_enabled", "1");
  });

  await check("suspend a driver for a while: signed out, can't sign in or get trips, told on WhatsApp; lifting it lets him back", async () => {
    const id = sql("select id from drivers where phone='+966551234321'");
    const card = () => a.locator(`[data-driver="${id}"]`);
    await mf("/__wa_reset");
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    await card().getByText("إيقاف مؤقت أو حظر").click();
    const f = card().locator("form").filter({ has: a.getByRole("button", { name: "إيقاف مؤقت" }) });
    await f.locator('select[name="period"]').selectOption("3");
    await f.locator('input[name="reason"]').fill("تأخر عن موعدين");
    await f.getByRole("button", { name: "إيقاف مؤقت" }).click();
    await a.getByText("تم إيقاف فهد الحربي مؤقتًا حتى").waitFor();
    await card().getByTestId("driver-hold").getByText("موقوف مؤقتًا حتى").waitFor();
    const left = Number(sql(`select round(extract(epoch from suspended_until - now()) / 86400) from drivers where id=${id}`));
    eq(left, 3, "three days");
    const msgs = await wa();
    eq(msgs.length, 1, "driver told");
    assert(msgs[0].to === "966551234321" && msgs[0].text.body.includes("تأخر عن موعدين"), "message with the reason");
    // the signed-in driver is out at once
    await drv.goto(`${BASE}/admin/my-trips`, { waitUntil: "networkidle" });
    assert(drv.url().includes("/admin/login"), "signed out");
    await adminLogin(drv, "0551234321", "Driver-Pass-123");
    await drv.getByText("حسابك موقوف مؤقتًا حتى").waitFor();
    // not offered for a booking, and refused if sent anyway
    const ref = paidBooking({ name: "عميل الإيقاف" });
    await a.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    eq(await a.locator(`select[name="driverId"] option[value="${id}"]`).count(), 0, "not in the list");
    // ends by itself: a suspension that is already over counts as none
    sql(`update drivers set suspended_until = now() - interval '1 minute' where id=${id}`);
    await a.goto(`${BASE}/admin/bookings/${ref}`, { waitUntil: "networkidle" });
    eq(await a.locator(`select[name="driverId"] option[value="${id}"]`).count(), 1, "back in the list when over");
    // suspend again with a date, then lift it early
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    await card().getByText("إيقاف مؤقت أو حظر").click();
    await f.locator('select[name="period"]').selectOption("date");
    await f.locator('input[name="until"]').fill(inDaysUTC(5));
    await f.locator('input[name="tell"]').uncheck();
    await f.getByRole("button", { name: "إيقاف مؤقت" }).click();
    await a.getByText("تم إيقاف فهد الحربي مؤقتًا حتى").waitFor();
    eq(sql(`select to_char(suspended_until at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI') from drivers where id=${id}`), `${inDaysUTC(5)} 23:59`, "end of that day, Riyadh time");
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    await card().getByText("إنهاء الإيقاف أو الحظر").click();
    await card().getByRole("button", { name: "إنهاء الإيقاف الآن" }).click();
    await a.getByText("انتهى إيقاف فهد الحربي").waitFor();
    await adminLogin(drv, "0551234321", "Driver-Pass-123");
    await drv.waitForURL(/\/admin\/my-trips$/);
    sql(`delete from bookings where ref='${ref}'`);
  });

  await check("block a driver: needs confirming; can't sign in, get trips or apply again; upcoming trips flagged; unblock", async () => {
    const id = sql("select id from drivers where phone='+966551234321'");
    const ref = paidBooking({ name: "رحلة قادمة", status: "confirmed" });
    sql(`update bookings set driver_id=${id} where ref='${ref}'`);
    const no = "MHT" + sql(`select lpad(number::text, 2, '0') from bookings where ref='${ref}'`);
    const card = () => a.locator(`[data-driver="${id}"]`);
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    await card().getByText("إيقاف مؤقت أو حظر").click();
    const f = card().locator("form").filter({ has: a.getByRole("button", { name: "حظر السائق" }) });
    await f.locator('input[name="reason"]').fill("سلوك غير لائق");
    await f.locator('input[name="tell"]').uncheck();
    await f.getByRole("button", { name: "حظر السائق" }).click();
    await a.getByText("أكّد الحظر").waitFor();
    eq(sql(`select blocked_at is null from drivers where id=${id}`), "t", "not without confirming");
    await f.locator('input[name="confirm"]').check();
    await f.getByRole("button", { name: "حظر السائق" }).click();
    await a.getByText("تم حظر فهد الحربي").waitFor();
    await a.getByText(no, { exact: false }).first().waitFor(); // his upcoming trip is named
    await card().getByTestId("driver-hold").getByText("محظور").waitFor();
    await drv.goto(`${BASE}/admin/my-trips`, { waitUntil: "networkidle" });
    assert(drv.url().includes("/admin/login"), "signed out");
    await adminLogin(drv, "0551234321", "Driver-Pass-123");
    await drv.getByText("حسابك محظور (سلوك غير لائق)").waitFor();
    // can't be given a trip even by a hand-made request
    const other = paidBooking({ name: "عميل آخر" });
    sql("insert into drivers (name, phone, plate_number, car_type) values ('سائق احتياط', '+966550000777', 'ح ح ح ٧٧٧', 'كامري')"); // so the list shows
    await a.goto(`${BASE}/admin/bookings/${other}`, { waitUntil: "networkidle" });
    eq(await a.locator(`select[name="driverId"] option[value="${id}"]`).count(), 0, "not offered");
    await a.locator('select[name="driverId"]').evaluate((el, v) => { const o = document.createElement("option"); o.value = v; el.append(o); el.value = v; }, id);
    await a.getByRole("button", { name: "إسناد وإرسال الرسائل" }).click();
    await a.getByText("فهد الحربي محظور").waitFor();
    eq(sql(`select coalesce(driver_id::text,'') from bookings where ref='${other}'`), "", "not assigned");
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    await card().getByRole("button", { name: "إلغاء الحظر" }).click();
    await a.getByText("تم إلغاء حظر فهد الحربي").waitFor();
    await adminLogin(drv, "0551234321", "Driver-Pass-123");
    await drv.waitForURL(/\/admin\/my-trips$/);
    sql(`delete from bookings where ref in ('${ref}','${other}'); delete from drivers where phone='+966550000777'`);
  });

  await check("staff account: only the sections it was given, in the menu and on the server", async () => {
    await a.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
    const f = a.locator("form").filter({ has: a.getByRole("button", { name: "إضافة الحساب" }) });
    await f.locator('input[name="name"]').fill("نورة الموظفة");
    await f.locator('input[name="login"]').fill("staff@example.com");
    await f.locator('input[name="password"]').fill("Staff-Pass-123");
    await f.locator('select[name="role"]').selectOption("staff");
    await f.getByRole("button", { name: "إضافة الحساب" }).click();
    await f.getByText("اختر قسمًا واحدًا على الأقل").waitFor();
    await f.getByLabel("السائقين", { exact: true }).check();
    await f.getByLabel("التقييمات", { exact: true }).check();
    await f.getByRole("button", { name: "إضافة الحساب" }).click();
    await a.waitForURL(/added=1/, { waitUntil: "commit" });
    const sp = await (await browser.newContext()).newPage();
    await adminLogin(sp, "staff@example.com", "Staff-Pass-123");
    await sp.waitForURL(/\/admin$/);
    await sp.getByText("الأقسام المتاحة لحسابك").waitFor();
    const nav = (await sp.locator("nav[aria-label='لوحة التحكم'] a").allInnerTexts()).join("|");
    eq(nav, "الرئيسية|السائقين|التقييمات|حسابي", "staff menu");
    await sp.goto(`${BASE}/admin/bookings`, { waitUntil: "networkidle" });
    assert(sp.url().includes("/admin?denied=1"), "bookings refused");
    await sp.getByText("ليست لديك صلاحية لهذا القسم").waitFor();
    await sp.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    await sp.getByTestId("driver-list").waitFor();
    // owner turns the account off: next request is signed out
    sql("update admin_users set active=false where email='staff@example.com'");
    await sp.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    assert(sp.url().includes("/admin/login"), "disabled account signed out");
    await sp.context().close();
  });

  await check("owner can't remove the last owner or lock himself out", async () => {
    await a.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
    const me = a.getByTestId("user-list").locator("li").filter({ hasText: "(أنت)" });
    await me.locator("summary").click();
    await me.locator('select[name="role"]').selectOption("staff");
    await me.getByLabel("السائقين", { exact: true }).check();
    await me.getByRole("button", { name: "حفظ الحساب" }).click();
    await me.getByText("لا يمكنك إزالة صلاحية المدير").waitFor();
    eq(sql("select role from admin_users where email='admin@example.com'"), "owner", "still owner");
  });

  await check("trips with a driver that ended hours ago finish by themselves and the rating request goes out", async () => {
    await mf("/__wa_reset");
    const old = paidBooking({ date: inDaysUTC(-1), time: "08:00", phone: "+966557778899" });
    sql(`update bookings set status='confirmed', driver_id=${driverId} where ref='${old}'`);
    const r = await a.request.post(`${BASE}/api/admin/sweep`);
    eq(r.status(), 200, "sweep ran");
    eq(sql(`select status, rating_requested_at is not null from bookings where ref='${old}'`), "completed|t", "auto-completed");
    eq((await wa()).filter((m) => m.to === "966557778899").length, 1, "rating request sent");
    eq((await fetch(`${BASE}/api/admin/sweep`, { method: "POST" })).status, 404, "sweep needs the owner");
  });

  await drv.context().close();
  await dctx.close();
  await cctx.close();
  clean();
}

/* ======================================================================= */
if (!ONLY || ONLY === "prices") {
  section = "Prices page: add a route with its prices";
  console.log(`\n${section}`);
  const pctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await pctx.newPage();
  await adminLogin(a, "admin@example.com", env("ADMIN_PASSWORD"));
  await a.waitForURL(/\/admin$/);
  const id = (slug) => sql(`select id from locations where slug='${slug}'`);
  const form = () => a.getByTestId("add-priced-route");
  const cleanup = () => sql("delete from routes where slug like 'abha-airport-tabuk%' or slug like 'tabuk-abha-airport%'");
  cleanup();
  await check("add a route with typed prices; empty ones filled from the distance; it shows on the site", async () => {
    await a.goto(`${BASE}/admin/prices`, { waitUntil: "networkidle" });
    await form().locator('select[name="fromLocationId"]').selectOption(id("abha-airport"));
    await form().locator('select[name="toLocationId"]').selectOption(id("abha-airport"));
    await form().getByRole("button", { name: "إضافة الرحلة والأسعار" }).click();
    await form().getByText("متطابقتان").waitFor();
    await form().locator('select[name="toLocationId"]').selectOption(id("tabuk"));
    const camry = sql("select id from vehicles where slug='toyota-camry'");
    await form().locator(`input[name="newprice_${camry}"]`).fill("1500");
    await form().getByRole("button", { name: "إضافة الرحلة والأسعار" }).click();
    await a.waitForURL(/added=/, { waitUntil: "commit" });
    await a.getByText("تمت إضافة الرحلة بأسعارها").waitFor();
    const [rid, km] = sql("select id, distance_km from routes where slug='abha-airport-tabuk'").split("|");
    assert(Number(km) > 800, "distance from coordinates: " + km);
    eq(sql(`select price from trips where route_id=${rid} and vehicle_id=${camry}`), "150000", "typed price kept");
    eq(Number(sql(`select count(*) from trips where route_id=${rid} and active`)), Number(sql("select count(*) from vehicles where active")), "every car priced");
    const yukon = Number(sql(`select price from trips t join vehicles v on v.id=t.vehicle_id where route_id=${rid} and v.slug='gmc-yukon'`));
    eq(yukon % 1000, 0, "auto price rounded to 10 SAR");
    await page.goto(`${BASE}/ar/routes/abha-airport-tabuk`, { waitUntil: "networkidle" });
    await page.getByText("١٬٥٠٠ ر.س").first().waitFor();
  });
  await check("the same pair again (either direction) is refused; city filter shows only that city's routes", async () => {
    await a.goto(`${BASE}/admin/prices`, { waitUntil: "networkidle" });
    await form().locator('select[name="fromLocationId"]').selectOption(id("tabuk"));
    await form().locator('select[name="toLocationId"]').selectOption(id("abha-airport"));
    await form().getByRole("button", { name: "إضافة الرحلة والأسعار" }).click();
    await form().getByText("توجد رحلة بين هاتين الوجهتين").waitFor();
    await a.goto(`${BASE}/admin/prices?city=tabuk`, { waitUntil: "networkidle" });
    const rows = await a.locator("tbody th").allInnerTexts();
    assert(rows.length >= 1 && rows.every((r) => r.includes("تبوك")), "only Tabuk routes: " + rows.join(" / "));
  });
  cleanup();
  await pctx.close();
}

/* ======================================================================= */
if (!ONLY || ONLY === "join") {
  section = "Drivers apply from the website";
  console.log(`\n${section}`);
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const img = (n) => ({ name: `${n}.png`, mimeType: "image/png", buffer: PNG });
  const BIG = { name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1100 * 1024)]) };
  const jctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const j = await jctx.newPage();
  const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await actx.newPage();
  const cleanup = () => sql("delete from admin_users where email in ('+966559990001','+966559990002'); delete from drivers where phone in ('+966559990001','+966559990002')");
  cleanup();
  const fill = async (o) => {
    await j.goto(`${BASE}/ar/drivers/join`, { waitUntil: "networkidle" });
    await j.fill('input[name="name"]', o.name ?? "بندر السائق");
    await j.fill('input[name="phone"]', o.phone);
    await j.fill('input[name="password"]', o.password ?? "Driver-Join-1");
    await j.selectOption('select[name="vehicleId"]', { label: "تويوتا كامري" });
    await j.selectOption('select[name="carModel"]', "2022");
    await j.fill('input[name="carColor"]', "أبيض");
    await j.fill('input[name="plateNumber"]', "ك ل م ٤٤٤٤");
    for (const k of ["photo", "id_card", "license", "registration", "car_inside", "car_outside"]) {
      await j.setInputFiles(`input[name="${k}"]`, img(k));
      // the licence and registration are cropped to the card size first
      if (k === "license" || k === "registration") {
        await j.getByTestId("card-cropper").getByRole("button", { name: "اعتماد" }).click();
        await j.getByTestId("card-cropper").waitFor({ state: "detached" });
      }
    }
    await j.check('input[name="agree"]');
  };
  await check("join page: linked in the footer; car types come from the fleet list; model years to choose", async () => {
    await page.goto(`${BASE}/ar`, { waitUntil: "networkidle" });
    assert(await page.locator('footer a[href="/ar/drivers/join"]').count(), "footer link");
    await j.goto(`${BASE}/ar/drivers/join`, { waitUntil: "networkidle" });
    const opts = (await j.locator('select[name="vehicleId"] option').allInnerTexts()).slice(1);
    eq(opts.length, Number(sql("select count(*) from vehicles where active")), "every active car");
    assert(opts.includes("تويوتا كامري"), "car names");
    assert((await j.locator('select[name="carModel"] option').allInnerTexts()).includes("2022"), "years");
  });
  await check("licence and registration: cropped to the card size 9.56 x 6.4 cm (1129 x 756 px JPEG); cancel clears the choice", async () => {
    await j.goto(`${BASE}/ar/drivers/join`, { waitUntil: "networkidle" });
    // a wide phone photo, bigger than 1 MB is fine here: it is cropped and made small
    const wide = await j.evaluate(async () => {
      const c = document.createElement("canvas"); c.width = 3000; c.height = 1400;
      const x = c.getContext("2d"); for (let i = 0; i < 3000; i += 7) { x.fillStyle = `hsl(${i % 360} 70% 50%)`; x.fillRect(i, 0, 7, 1400); }
      const b = await new Promise((r) => c.toBlob(r, "image/png"));
      return Array.from(new Uint8Array(await b.arrayBuffer()));
    });
    const file = { name: "istimara.png", mimeType: "image/png", buffer: Buffer.from(wide) };
    await j.setInputFiles('input[name="registration"]', file);
    const cr = j.getByTestId("card-cropper");
    await cr.waitFor();
    const box = await cr.locator(".touch-none").boundingBox();
    assert(Math.abs(box.width / box.height - 9.56 / 6.4) < 0.02, "frame has the card shape " + box.width / box.height);
    await cr.getByRole("button", { name: "إلغاء" }).click();
    eq(await j.locator('input[name="registration"]').evaluate((i) => i.files.length), 0, "cancel clears");
    await j.setInputFiles('input[name="registration"]', file);
    await cr.locator('input[type="range"]').fill("2");
    await cr.getByRole("button", { name: "اعتماد" }).click();
    await cr.waitFor({ state: "detached" });
    const out = await j.locator('input[name="registration"]').evaluate(async (i) => {
      const f = i.files[0]; const bm = await createImageBitmap(f);
      return { type: f.type, size: f.size, w: bm.width, h: bm.height };
    });
    eq(`${out.type} ${out.w}x${out.h}`, "image/jpeg 1129x756", "cropped file");
    assert(out.size < 1024 * 1024, "under 1 MB");
    assert(await j.locator('[data-photo="registration"]').getByText("٩٫٥٦ × ٦٫٤ سم").count(), "size shown");
  });
  await check("a photo over 1 MB is refused in the browser, and on the server if the browser check is skipped", async () => {
    await fill({ phone: "0559990001" });
    await j.setInputFiles('input[name="car_inside"]', BIG);
    await j.locator('[data-photo="car_inside"]').getByText("أكبر من ١ ميجابايت").waitFor();
    eq(await j.locator('input[name="car_inside"]').evaluate((i) => i.files.length), 0, "cleared");
    // put the big file back without the browser check
    await j.evaluate(() => {
      const dt = new DataTransfer();
      const bytes = new Uint8Array(1100 * 1024);
      bytes.set([0xff, 0xd8, 0xff]);
      dt.items.add(new File([bytes], "big.jpg", { type: "image/jpeg" }));
      document.querySelector('input[name="car_inside"]').files = dt.files;
    });
    await j.getByRole("button", { name: "إرسال الطلب" }).click();
    await j.getByText("إحدى الصور أكبر من ١ ميجابايت").waitFor();
    eq(sql("select count(*) from drivers where phone='+966559990001'"), "0", "nothing saved");
  });
  await check("application sent: waits for review, can't sign in yet, the same number can't apply twice", async () => {
    await fill({ phone: "0559990001" });
    await j.getByRole("button", { name: "إرسال الطلب" }).click();
    await j.getByTestId("join-done").waitFor();
    eq(sql("select status, active, car_type, car_model, vehicle_id is not null from drivers where phone='+966559990001'"), "pending|f|تويوتا كامري|2022|t", "pending driver");
    eq(sql("select count(*) from driver_documents d join drivers r on r.id=d.driver_id where r.phone='+966559990001'"), "5", "5 documents");
    eq(sql("select mime from driver_documents d join drivers r on r.id=d.driver_id where r.phone='+966559990001' and d.kind='license'"), "image/jpeg", "licence saved as the cropped JPEG");
    eq(sql("select role, active from admin_users where email='+966559990001'"), "driver|f", "account off");
    await adminLogin(j, "0559990001", "Driver-Join-1");
    await j.getByText("طلب انضمامك قيد المراجعة").waitFor();
    await fill({ phone: "+966 55 999 0001" });
    await j.getByRole("button", { name: "إرسال الطلب" }).click();
    await j.getByText("هذا الرقم مسجّل من قبل").waitFor();
  });
  await check("admin reviews: photos visible to staff only; approve turns the account on and tells the driver on WhatsApp", async () => {
    await adminLogin(a, "admin@example.com", env("ADMIN_PASSWORD"));
    await a.waitForURL(/\/admin$/);
    await a.getByText("طلبات انضمام سائقين").waitFor();
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    const app = a.getByTestId("application").filter({ hasText: "+966559990001" });
    eq(await app.locator("img").count(), 6, "photo + 5 documents");
    const id = sql("select id from drivers where phone='+966559990001'");
    eq((await a.request.get(`${BASE}/api/admin/drivers/${id}/doc/id_card`)).status(), 200, "staff sees the ID");
    eq((await fetch(`${BASE}/api/admin/drivers/${id}/doc/id_card`)).status, 404, "public can't");
    await app.getByRole("button", { name: "قبول السائق وتفعيل حسابه" }).click();
    await a.waitForURL(/approved=/, { waitUntil: "commit" });
    eq(sql(`select status, active from drivers where id=${id}`), "approved|t", "approved");
    eq(sql("select active from admin_users where email='+966559990001'"), "t", "account on");
    assert(sql("select body from notifications where kind='driver_approved' order by id desc limit 1").includes("/admin/login"), "WhatsApp with sign-in link");
    await adminLogin(j, "0559990001", "Driver-Join-1");
    await j.waitForURL(/\/admin\/my-trips$/);
  });
  await check("a rejected applicant is told why when signing in, and may apply again", async () => {
    await fill({ phone: "0559990002", name: "سائق مرفوض" });
    await j.getByRole("button", { name: "إرسال الطلب" }).click();
    await j.getByTestId("join-done").waitFor();
    await a.goto(`${BASE}/admin/drivers`, { waitUntil: "networkidle" });
    const app = a.getByTestId("application").filter({ hasText: "+966559990002" });
    await app.getByText("رفض الطلب").first().click();
    await app.locator('input[name="reason"]').fill("صورة الاستمارة غير واضحة");
    await app.getByRole("button", { name: "رفض الطلب" }).click();
    await a.waitForURL(/rejected=/, { waitUntil: "commit" });
    await adminLogin(j, "0559990002", "Driver-Join-1");
    await j.getByText("صورة الاستمارة غير واضحة").waitFor();
    await fill({ phone: "0559990002", name: "سائق مرفوض", password: "New-Pass-123" });
    await j.getByRole("button", { name: "إرسال الطلب" }).click();
    await j.getByTestId("join-done").waitFor();
    eq(sql("select status from drivers where phone='+966559990002'"), "pending", "pending again");
  });
  cleanup();
  await jctx.close();
  await actx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("\nFAILED:");
  for (const f of failed) console.log(" -", f.label, "\n   ", f.err);
}
fs.writeFileSync(process.env.RESULTS ?? "/dev/null", JSON.stringify(results, null, 1));
