import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/admin/ui";
import { Drivers } from "../drivers/drivers-view";

export default function DriverTeamPage({ searchParams }: PageProps<"/admin/driver-team">) {
  return (
    <>
      <PageHeader title="فريق السائقين" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <Drivers searchParams={searchParams} view="team" />
      </Suspense>
    </>
  );
}
