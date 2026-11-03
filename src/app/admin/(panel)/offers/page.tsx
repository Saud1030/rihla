import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/admin/ui";
import { RuleList } from "@/components/admin/rule-list";

export default function OffersPage() {
  return (
    <>
      <PageHeader title="العروض" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <RuleList kind="offers" />
      </Suspense>
    </>
  );
}
