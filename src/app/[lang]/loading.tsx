import { CarLoader } from "@/components/site/car-loader";

/** while the next page loads */
export default function Loading() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <CarLoader />
    </div>
  );
}
