import { NextResponse, type NextRequest } from "next/server";
import { handleWebhook } from "@/lib/edfapay";

/**
 * EdfaPay webhook. In the EdfaPay dashboard -> Webhook:
 *   URL:     https://YOUR-DOMAIN/api/payments/edfapay
 *   Secret:  the same value saved in Admin -> Payment gateways -> EdfaPay -> Webhook Secret
 * The signature is checked on the RAW body before anything is read or changed (see lib/edfapay.ts).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 100_000) return NextResponse.json({ error: "too large" }, { status: 413 });
  const r = await handleWebhook(raw, req.headers.get("x-edfapay-signature"));
  return NextResponse.json(r.body, { status: r.status });
}
