import { Suspense } from "react";
import { StaffDashboard } from "./StaffDashboard";

export default function StaffPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center bg-neutral-50 text-neutral-600">
          Loading staff…
        </main>
      }
    >
      <StaffDashboard />
    </Suspense>
  );
}
