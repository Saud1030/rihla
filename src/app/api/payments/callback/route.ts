import type { NextRequest } from "next/server";
import { seeOther } from "@/lib/http";
import { isLocale } from "@/i18n/dictionaries";
import { normalizeRef } from "@/lib/booking";
import { GatewayError, getPaymentStatus, isValidPaymentId, settlePayment } from "@/lib/myfatoorah";

/**
 * MyFatoorah sends the customer back here after paying (CallBackUrl) or failing (ErrorUrl):
 *   /api/payments/callback?ref=BOOKING&lang=ar&paymentId=0707...&Id=0707...
 * Nothing in the URL is trusted except the payment id, which we look up with our API key.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const ref = normalizeRef(q.get("ref") ?? "");
  const lang = isLocale(q.get("lang") ?? "") ? (q.get("lang") as string) : "ar";
  const paymentId = q.get("paymentId") ?? q.get("PaymentId") ?? q.get("Id") ?? "";

  const path = ref ? `/${lang}/booking/${ref}` : `/${lang}/booking`;
  const out = new URLSearchParams();

  if (!ref || !isValidPaymentId(paymentId)) {
    out.set("result", "failed");
    return seeOther(path, out);
  }

  try {
    const status = await getPaymentStatus(paymentId);
    const result = status ? await settlePayment(status) : null;
    // Success only if THIS booking was settled
    const paid = !!result?.ok && result.bookingRef === ref;
    out.set("result", paid ? "paid" : "failed");
  } catch (e) {
    // Can't reach MyFatoorah right now. The customer may have paid, so don't say it failed:
    // the webhook (or the next page refresh) will settle it.
    console.error("Payment callback error", e instanceof GatewayError ? e.message : e);
    out.set("result", "verifying");
    out.set("pid", paymentId);
  }
  return seeOther(path, out);
}
