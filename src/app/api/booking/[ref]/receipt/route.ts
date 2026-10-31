import { getBookingByRef } from "@/lib/booking";
import { companyDetails } from "@/lib/company";
import { receiptFileName, receiptPdf } from "@/lib/receipt-pdf";

/**
 * The payment voucher as a PDF. WhatsApp downloads it from here to deliver it to the customer,
 * and the voucher page links to it. The secret booking ref is the key.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/booking/[ref]/receipt">) {
  const { ref } = await ctx.params;
  const b = await getBookingByRef(ref);
  if (!b || !b.receiptNo) return new Response("Not found", { status: 404 });
  const pdf = await receiptPdf(b, await companyDetails(b.locale === "en" ? "en" : "ar"));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${receiptFileName(b)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
