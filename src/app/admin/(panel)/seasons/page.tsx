import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/admin/ui";
import { RuleList } from "@/components/admin/rule-list";

export default function SeasonsPage() {
  return (
    <>
      <PageHeader title="المواسم" />
      <Suspense fallback={<Skeleton h="h-96" />}>
        <RuleList kind="seasons" />
      </Suspense>
    </>
  );
}
