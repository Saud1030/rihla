import { NextResponse, type NextRequest } from "next/server";
import { GatewayError, getPaymentStatus, isValidPaymentId, settlePayment, verifyWebhookSignature } from "@/lib/myfatoorah";

/**
 * MyFatoorah webhook (V2). In the MyFatoorah portal -> Integration Settings -> Webhook:
 *   Endpoint:        https://YOUR-DOMAIN/api/payments/webhook
 *   Version:         V2
 *   Secret key:      same value as MYFATOORAH_WEBHOOK_SECRET
 *   Events:          Payment status changed
 *
 * The signature is checked first; then the payment is re-fetched with GetPaymentStatus
 * before anything changes, so a replayed or forged body can't mark a booking paid.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MYFATOORAH_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  let body: {
    Event?: { Code?: number; Name?: string };
    Data?: { Invoice?: { Id?: string | number; Status?: string; ExternalIdentifier?: string | null }; Transaction?: { Status?: string; PaymentId?: string } };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Only payment status changes matter here; acknowledge everything else
  if (body.Event?.Code !== 1) return NextResponse.json({ ok: true, ignored: body.Event?.Name ?? "unknown event" });

  const data = body.Data ?? {};
  if (!verifyWebhookSignature(data, req.headers.get("myfatoorah-signature"), secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const paymentId = String(data.Transaction?.PaymentId ?? "");
  if (!isValidPaymentId(paymentId)) return NextResponse.json({ ok: true, ignored: "no payment id" });

  try {
    const status = await getPaymentStatus(paymentId);
    if (!status) return NextResponse.json({ ok: true, ignored: "payment not found" });
    const result = await settlePayment(status);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("Webhook error", e instanceof GatewayError ? e.message : e);
    // Non-2xx makes MyFatoorah retry later
    return NextResponse.json({ error: "temporary failure" }, { status: 500 });
  }
}
