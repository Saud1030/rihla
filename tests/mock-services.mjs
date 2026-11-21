// Local stand-ins used by the tests and `npm run local` (no real services, no real money):
// Also a stand-in for the WhatsApp Cloud API (Meta):
//   POST /v21.0/:phoneNumberId/messages -> { messages: [{ id }] }   (numbers ending in 0000 are refused)
//   GET  /__wa -> every message received; /__wa_reset clears them
import http from "node:http";

import fs from "node:fs";
const PORT = 4010;
const waMessages = [];
const wafeqInvoices = [];
const alostaz = { partners: [], invoices: [], products: [{ id: 7, name: "منتج قديم" }], submitted: [] };
// Google (OAuth + Drive) stand-in: /google/auth, /google/token, /google/revoke, /google/api/... ; GET /__gdrive
const gdrive = { refresh: new Set(), revoked: [], folders: [], files: [] };
const WA_TOKEN = process.env.WA_TOKEN ?? fs.readFileSync(".env", "utf8").match(/^WHATSAPP_TOKEN=(.*)$/m)?.[1]?.trim();

const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
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
    if (url.pathname === "/__gdrive") return json(res, 200, { ...gdrive, refresh: [...gdrive.refresh] });
    if (url.pathname === "/google/auth") {
      // the consent page: the test passes ?deny=1 to the site's connect link... here we simply approve
      const back = new URL(url.searchParams.get("redirect_uri"));
      back.searchParams.set("code", "code-" + Date.now());
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (url.pathname === "/google/token" && req.method === "POST") {
      const b = new URLSearchParams(await readBody(req));
      if (!b.get("client_id")?.endsWith(".apps.googleusercontent.com") || b.get("client_secret") !== "test-secret") return json(res, 401, { error: "invalid_client", error_description: "The OAuth client was not found." });
      if (b.get("grant_type") === "authorization_code") {
        const rt = "rt-" + Date.now();
        gdrive.refresh.add(rt);
        const idt = ["e30", Buffer.from(JSON.stringify({ email: "owner@example.com" })).toString("base64url"), "sig"].join(".");
        return json(res, 200, { access_token: "at-1", refresh_token: rt, id_token: idt, expires_in: 3599 });
      }
      if (b.get("grant_type") === "refresh_token") {
        if (!gdrive.refresh.has(b.get("refresh_token"))) return json(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
        return json(res, 200, { access_token: "at-2", expires_in: 3599 });
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }
    if (url.pathname === "/google/revoke") { const t = url.searchParams.get("token"); gdrive.refresh.delete(t); gdrive.revoked.push(t); return json(res, 200, {}); }
    if (url.pathname.startsWith("/google/api/")) {
      if (!/^Bearer at-/.test(req.headers.authorization ?? "")) return json(res, 401, { error: { message: "Invalid Credentials" } });
      const p = url.pathname.slice("/google/api".length);
      if (p === "/drive/v3/files" && req.method === "POST") {
        const b = JSON.parse(await readBody(req));
        const id = "fld" + (gdrive.folders.length + 1);
        gdrive.folders.push({ id, ...b });
        return json(res, 200, { id });
      }
      const one = p.match(/^\/drive\/v3\/files\/([^/]+)$/);
      if (one && req.method === "GET") return gdrive.folders.some((f) => f.id === one[1]) ? json(res, 200, { id: one[1], trashed: false }) : json(res, 404, { error: { message: "File not found" } });
      if (p === "/upload/drive/v3/files" && req.method === "POST") {
        const chunks = []; for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks);
        const text = raw.toString("latin1");
        const meta = JSON.parse(Buffer.from(text.match(/\r\n\r\n(\{.*?\})\r\n--/s)[1], "latin1").toString("utf8"));
        const zip = raw.indexOf(Buffer.from("PK\x03\x04", "latin1"));
        const id = "file" + (gdrive.files.length + 1);
        gdrive.files.push({ id, name: meta.name, parents: meta.parents, mimeType: meta.mimeType, xlsx: zip > 0, bytes: raw.length });
        return json(res, 200, { id, name: meta.name, webViewLink: `https://drive.google.com/file/d/${id}/view` });
      }
      return json(res, 404, { error: { message: "not found" } });
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

  })
  .listen(PORT, () => console.log(`mock services on ${PORT}`));
