import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/admin/ui";
import { Drivers } from "./drivers-view";

export default function DriversPage({ searchParams }: PageProps<"/admin/drivers">) {
  return (
    <>
      <PageHeader title="طلبات السائقين" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Drivers searchParams={searchParams} view="requests" />
      </Suspense>
    </>
  );
}
