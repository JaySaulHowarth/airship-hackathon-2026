import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold text-neutral-900">Page not found</h1>
      <Link href="/" className="text-sm font-medium text-neutral-700 underline">
        Back home
      </Link>
    </main>
  );
}
