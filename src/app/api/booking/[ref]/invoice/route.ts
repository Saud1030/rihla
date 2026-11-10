import { getBookingByRef } from "@/lib/booking";
import { companyDetails } from "@/lib/company";
import { invoiceFileName, invoicePdf } from "@/lib/invoice-pdf";

/** The proforma invoice as a PDF (WhatsApp downloads it to deliver it). The secret booking ref is the key. */
export async function GET(_req: Request, ctx: RouteContext<"/api/booking/[ref]/invoice">) {
  const { ref } = await ctx.params;
  const b = await getBookingByRef(ref);
  if (!b || !b.invoiceNo) return new Response("Not found", { status: 404 });
  const pdf = await invoicePdf(b, await companyDetails(b.locale === "en" ? "en" : "ar"));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoiceFileName(b)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
}
