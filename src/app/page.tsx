import { TABLE_NUMBER_MAX, TABLE_NUMBER_MIN } from "@/lib/contracts";

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Table Order</h1>
      <p className="max-w-md text-neutral-600">
        Next.js scaffold is ready. Contracts resolve from{" "}
        <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">
          @/lib/contracts
        </code>
        . Tables {TABLE_NUMBER_MIN}–{TABLE_NUMBER_MAX} per contract constants.
      </p>
    </main>
  );
}
