import { Suspense } from "react";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { companyDetails } from "@/lib/company";
import { PayoutSheet } from "@/components/site/money-document";

export const metadata = { title: "سند صرف" };

/** The voucher for money paid to a driver: staff of the drivers section, or that driver himself */
export default function PayoutVoucherPage({ params }: PageProps<"/admin/payouts/[id]">) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 print:p-0">
      <Suspense fallback={<div className="h-96 rounded-xl bg-paper border border-line" />}>
        <View params={params} />
      </Suspense>
    </div>
  );
}

async function View({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  const [row] = await db
    .select({ p: s.driverPayouts, name: s.drivers.name, phone: s.drivers.phone, plateNumber: s.drivers.plateNumber })
    .from(s.driverPayouts)
    .innerJoin(s.drivers, eq(s.drivers.id, s.driverPayouts.driverId))
    .where(eq(s.driverPayouts.id, Number(id)))
    .limit(1);
  if (!row) notFound();
  if (!(can(me, "drivers") || (me.role === "driver" && me.driverId === row.p.driverId))) notFound();
  return <PayoutSheet p={row.p} driver={{ name: row.name, phone: row.phone, plateNumber: row.plateNumber }} c={await companyDetails("ar")} />;
}
