// Local stand-in for MyFatoorah API v2, shaped after https://docs.myfatoorah.com
//   POST /v2/SendPayment       -> { IsSuccess, Data: { InvoiceId, InvoiceURL } }
//   POST /v2/GetPaymentStatus  -> { IsSuccess, Data: { InvoiceId, InvoiceStatus, InvoiceValue, CustomerReference, InvoiceTransactions[] } }
//   GET  /pay/:invoiceId       -> fake hosted payment page (Pay / Decline buttons)
//   POST /v2/MakeRefund        -> { IsSuccess, Data: { RefundId, RefundReference, Amount } }
// Test helpers: /__down, /__up, GET /__last, GET /__refunds, POST /__invoice (inject invoice)
// Also a stand-in for the WhatsApp Cloud API (Meta):
//   POST /v21.0/:phoneNumberId/messages -> { messages: [{ id }] }   (numbers ending in 0000 are refused)
//   GET  /__wa -> every message received; /__wa_reset clears them
import http from "node:http";

import fs from "node:fs";
// token the app sends: MF_TOKEN, or MYFATOORAH_API_KEY from .env
const TOKEN = process.env.MF_TOKEN ?? fs.readFileSync(".env", "utf8").match(/^MYFATOORAH_API_KEY=(.*)$/m)?.[1]?.trim();
const PORT = 4010;
// where the browser reaches this mock (differs from localhost in Codespaces)
// may be relative ("/mock-pay") when the site forwards that path here (npm run local)
const PUBLIC_URL = (process.env.MOCK_PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const PREFIX = new URL(PUBLIC_URL, "http://x").pathname.replace(/\/$/, "");
const invoices = new Map(); // id -> invoice
const byPayment = new Map(); // paymentId -> invoiceId
let nextInvoice = 6400000;
let down = false;
let last = null;
const refunds = [];
let nextRefund = 900;
const waMessages = [];
const wafeqInvoices = [];
const alostaz = { partners: [], invoices: [], products: [{ id: 7, name: "منتج قديم" }], submitted: [] };
const WA_TOKEN = process.env.WA_TOKEN ?? fs.readFileSync(".env", "utf8").match(/^WHATSAPP_TOKEN=(.*)$/m)?.[1]?.trim();

const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const newPaymentId = (inv) => `0707${inv.InvoiceId}${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 100)}`.slice(0, 20);
const addParams = (url, pid) => `${url}${url.includes("?") ? "&" : "?"}paymentId=${pid}&Id=${pid}`;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname === "/__down") { down = true; return json(res, 200, { down }); }
    if (url.pathname === "/__up") { down = false; return json(res, 200, { down }); }
    if (url.pathname === "/__last") return json(res, 200, last);
    if (url.pathname === "/__refunds") return json(res, 200, refunds);
    if (url.pathname === "/__tamper") { const b = JSON.parse(await readBody(req)); Object.assign(invoices.get(Number(b.invoiceId)), b.patch); return json(res, 200, { ok: true }); }
    if (url.pathname === "/__invoice") {
      // inject an invoice with given transactions: { InvoiceValue, CustomerReference, InvoiceStatus, InvoiceTransactions:[{PaymentId, TransactionStatus}] }
      const b = JSON.parse(await readBody(req));
      const inv = { InvoiceId: nextInvoice++, InvoiceStatus: "Pending", InvoiceTransactions: [], ...b };
      invoices.set(inv.InvoiceId, inv);
      for (const t of inv.InvoiceTransactions) byPayment.set(t.PaymentId, inv.InvoiceId);
      return json(res, 200, inv);
    }

    // ---- Wafeq (e-invoicing) stand-in: /wafeq/v1/... with "Authorization: Api-Key test-wafeq-key" ----
    if (url.pathname === "/__wafeq") return json(res, 200, wafeqInvoices);
    if (url.pathname.startsWith("/wafeq/v1/")) {
      if (req.headers.authorization !== "Api-Key test-wafeq-key") return json(res, 401, { detail: "Invalid API key." });
      const p = url.pathname.slice("/wafeq/v1".length);
      if (p.startsWith("/accounts/") && req.method === "GET") return json(res, 200, { count: 2, results: [{ id: "acc_sales", name: "Sales", name_ar: "المبيعات", type: "REVENUE" }, { id: "acc_cash", name: "Cash", type: "ASSET" }] });
      const body = JSON.parse((await readBody(req)) || "{}");
      if (p === "/contacts/" && req.method === "POST") {
        if (!body.name) return json(res, 400, { errors: [{ field: "name", message: "required" }] });
        return json(res, 201, { id: `cnt_${wafeqInvoices.length + 1}`, ...body });
      }
      if (p === "/invoices/" && req.method === "POST") {
        const bad = !String(body.contact ?? "").startsWith("cnt_") || !body.invoice_number || !(body.line_items ?? []).every((l) => l.account === "acc_sales" && l.unit_amount > 0);
        if (bad) return json(res, 400, { errors: [{ message: "invalid invoice" }] });
        const inv = { id: `inv_${wafeqInvoices.length + 1}`, status: "DRAFT", ...body };
        wafeqInvoices.push(inv);
        return json(res, 201, inv);
      }
      const rep = p.match(/^\/invoices\/([^/]+)\/tax-authority\/report\/$/);
      if (rep && req.method === "POST") {
        const inv = wafeqInvoices.find((x) => x.id === rep[1]);
        if (!inv) return json(res, 404, { detail: "Not found." });
        inv.status = "REPORTED";
        return json(res, 200, { status: "REPORTED" });
      }
      return json(res, 404, { detail: "Not found." });
    }
    // ---- Alostaz (alostaz.io) stand-in: /alostaz/... with "Authorization: Bearer test-alostaz-token" and the required headers ----
    if (url.pathname === "/__alostaz") return json(res, 200, alostaz);
    if (url.pathname.startsWith("/alostaz/")) {
      if (req.headers.authorization !== "Bearer test-alostaz-token") return json(res, 401, { message: "Unauthenticated." });
      if (req.headers["x-branch-id"] !== "1" || !req.headers["x-api-version"] || !["ar", "en"].includes(req.headers["x-locale"])) return json(res, 422, { message: "missing headers" });
      const p = url.pathname.slice("/alostaz".length);
      if (p === "/taxes" && req.method === "GET") return json(res, 200, { data: [{ id: 3, name: "معفى", percentage: 0 }, { id: 4, name: "ضريبة القيمة المضافة", percentage: 15 }] });
      if (p === "/storehouses" && req.method === "GET") return json(res, 200, { data: [{ id: 2, name: "المستودع الرئيسي" }] });
      if (p === "/products" && req.method === "GET") return json(res, 200, { data: alostaz.products.filter((x) => x.name.includes(url.searchParams.get("search") ?? "")) });
      const body = JSON.parse((await readBody(req)) || "{}");
      if (p === "/products" && req.method === "POST") {
        if (!body.name || !Array.isArray(body.units) || body.supports_inventory !== 0) return json(res, 422, { errors: { name: ["required"] } });
        const row = { id: 100 + alostaz.products.length, ...body };
        alostaz.products.push(row);
        return json(res, 201, { data: row });
      }
      if (p === "/partners" && req.method === "POST") {
        if (body.type !== "client" || !body.name || !body.nature) return json(res, 422, { errors: { name: ["required"] } });
        const row = { id: 500 + alostaz.partners.length, ...body };
        alostaz.partners.push(row);
        return json(res, 201, { data: row });
      }
      if (p === "/invoices" && req.method === "POST") {
        const ok = body.variant === "standard" && body.nature === "sale" && body.status === "issued" && alostaz.partners.some((x) => x.id === body.partner_id) && (body.line_items ?? []).every((l) => alostaz.products.some((x) => x.id === l.product_id) && l.storehouse_id === 2 && Number.isInteger(l.unit_quantity) && l.unit_price > 0);
        if (!ok) return json(res, 422, { errors: { line_items: ["invalid"] } });
        const row = { id: 900 + alostaz.invoices.length, ...body };
        alostaz.invoices.push(row);
        return json(res, 201, { data: row });
      }
      if (p === "/helpers/zatca/submit" && req.method === "POST") {
        if (!alostaz.invoices.some((x) => x.id === body.invoice_id)) return json(res, 404, { message: "Not found" });
        alostaz.submitted.push(body.invoice_id);
        return json(res, 200, { data: { status: "reported" } });
      }
      return json(res, 404, { message: "Not found" });
    }
    if (url.pathname === "/__wa") return json(res, 200, waMessages);
    if (url.pathname === "/__wa_reset") { waMessages.length = 0; return json(res, 200, { ok: true }); }
    const wa = url.pathname.match(/^\/v\d+\.\d+\/([^/]+)\/messages$/);
    if (wa && req.method === "POST") {
      if (!WA_TOKEN || req.headers.authorization !== `Bearer ${WA_TOKEN}`) return json(res, 401, { error: { message: "Invalid OAuth access token.", code: 190 } });
      const body = JSON.parse((await readBody(req)) || "{}");
      if (body.messaging_product !== "whatsapp" || !/^\d{8,15}$/.test(body.to ?? "")) return json(res, 400, { error: { message: "Invalid parameter", code: 100 } });
      if (body.type === "template" && (body.template?.components?.[0]?.parameters ?? []).some((x) => /[\n\t]| {5,}/.test(x.text)))
        return json(res, 400, { error: { message: "Param text cannot have new-line/tab characters or more than 4 consecutive spaces", code: 132018 } });
      if (body.to.endsWith("0000")) return json(res, 400, { error: { message: "Recipient phone number not in allowed list", code: 131030 } });
      const id = `wamid.mock${waMessages.length + 1}`;
      waMessages.push({ id, phoneNumberId: wa[1], ...body });
      return json(res, 200, { messaging_product: "whatsapp", contacts: [{ input: body.to, wa_id: body.to }], messages: [{ id }] });
    }

    if (url.pathname.startsWith("/v2/")) {
      if (down) return json(res, 503, { IsSuccess: false, Message: "Service Unavailable" });
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(res, 401, { IsSuccess: false, Message: "Unauthorized" });
      const body = JSON.parse((await readBody(req)) || "{}");

      if (url.pathname === "/v2/SendPayment") {
        const errs = [];
        if (!(body.InvoiceValue > 0)) errs.push({ Name: "InvoiceValue", Error: "Invoice value must be greater than zero" });
        if (!body.CustomerName) errs.push({ Name: "CustomerName", Error: "The CustomerName field is required." });
        if (!["LNK", "EML", "SMS", "ALL"].includes(body.NotificationOption)) errs.push({ Name: "NotificationOption", Error: "Invalid" });
        const itemsTotal = (body.InvoiceItems ?? []).reduce((a, i) => a + i.Quantity * i.UnitPrice, 0);
        if (body.InvoiceItems && Math.abs(itemsTotal - body.InvoiceValue) > 0.001) errs.push({ Name: "InvoiceValue", Error: "Invoice value must equal items total" });
        if ((body.CallBackUrl ?? "").length > 254) errs.push({ Name: "CallBackUrl", Error: "Max length 254" });
        if (errs.length) return json(res, 400, { IsSuccess: false, Message: "Invalid data", ValidationErrors: errs, Data: null });
        const inv = {
          InvoiceId: nextInvoice++,
          InvoiceStatus: "Pending",
          InvoiceValue: body.InvoiceValue,
          CustomerReference: body.CustomerReference ?? null,
          UserDefinedField: body.UserDefinedField ?? null,
          CallBackUrl: body.CallBackUrl,
          ErrorUrl: body.ErrorUrl,
          Language: body.Language,
          InvoiceTransactions: [],
        };
        invoices.set(inv.InvoiceId, inv);
        last = { request: body, invoiceId: inv.InvoiceId };
        return json(res, 200, { IsSuccess: true, Message: "Invoice Created Successfully!", ValidationErrors: null, Data: { InvoiceId: inv.InvoiceId, InvoiceURL: `${PUBLIC_URL}/pay/${inv.InvoiceId}`, CustomerReference: inv.CustomerReference, UserDefinedField: inv.UserDefinedField } });
      }

      if (url.pathname === "/v2/GetPaymentStatus") {
        let inv;
        if (String(body.KeyType).toLowerCase() === "paymentid") inv = invoices.get(byPayment.get(body.Key));
        else if (String(body.KeyType).toLowerCase() === "invoiceid") inv = invoices.get(Number(body.Key));
        if (!inv) return json(res, 400, { IsSuccess: false, Message: "Invalid key", ValidationErrors: [{ Name: "Key", Error: "Invalid key" }], Data: null });
        const { CallBackUrl, ErrorUrl, Language, ...data } = inv;
        return json(res, 200, { IsSuccess: true, Message: "", ValidationErrors: null, Data: data });
      }
      if (url.pathname === "/v2/MakeRefund") {
        const inv = String(body.KeyType).toLowerCase() === "paymentid" ? invoices.get(byPayment.get(body.Key)) : invoices.get(Number(body.Key));
        if (!inv || inv.InvoiceStatus !== "Paid") return json(res, 400, { IsSuccess: false, Message: "Invalid key", ValidationErrors: [{ Name: "Key", Error: "Payment not found or not paid" }], Data: null });
        inv.Refunded = inv.Refunded ?? 0;
        const remaining = Number(inv.InvoiceValue) - inv.Refunded;
        if (!(body.Amount > 0) || body.Amount > remaining + 0.0001)
          return json(res, 400, { IsSuccess: false, Message: "Refund amount exceeds the remaining amount", ValidationErrors: [{ Name: "Amount", Error: "Too large" }], Data: null });
        inv.Refunded += body.Amount;
        refunds.push({ key: body.Key, amount: body.Amount, comment: body.Comment });
        const id = nextRefund++;
        return json(res, 200, { IsSuccess: true, Message: "Refund Created Successfully!", ValidationErrors: null, Data: { Key: body.Key, RefundId: id, RefundReference: `RF-${id}`, RefundInvoiceId: String(inv.InvoiceId), Amount: body.Amount, Comment: body.Comment } });
      }
      return json(res, 404, { IsSuccess: false, Message: "Not found" });
    }

    // fake hosted payment page
    const m = url.pathname.match(/^\/pay\/(\d+)(?:\/(success|fail))?$/);
    if (m) {
      const inv = invoices.get(Number(m[1]));
      if (!inv) { res.writeHead(404); return res.end("no invoice"); }
      if (!m[2]) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(`<!doctype html><meta charset=utf-8><title>MyFatoorah (mock)</title><h1>MyFatoorah mock checkout</h1>
          <p id=amount>${inv.InvoiceValue} SAR</p><p>Ref ${inv.CustomerReference}</p>
          <a id=pay href="${PREFIX}/pay/${inv.InvoiceId}/success">Pay</a> <a id=decline href="${PREFIX}/pay/${inv.InvoiceId}/fail">Decline</a>`);
      }
      const pid = newPaymentId(inv);
      byPayment.set(pid, inv.InvoiceId);
      if (m[2] === "success") {
        inv.InvoiceStatus = "Paid";
        inv.InvoiceTransactions.push({ PaymentId: pid, TransactionStatus: "Succss", PaymentGateway: "MADA", TransationValue: String(inv.InvoiceValue), Currency: "SAR", Error: null });
        res.writeHead(302, { Location: addParams(inv.CallBackUrl, pid) });
      } else {
        inv.InvoiceTransactions.push({ PaymentId: pid, TransactionStatus: "Failed", PaymentGateway: "VISA/MASTER", TransationValue: String(inv.InvoiceValue), Currency: "SAR", Error: "Insufficient funds" });
        res.writeHead(302, { Location: addParams(inv.ErrorUrl, pid) });
      }
      return res.end();
    }
    json(res, 404, {});
  })
  .listen(PORT, () => console.log(`mock myfatoorah on ${PORT}`));
