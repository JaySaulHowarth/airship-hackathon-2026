import {
  TABLE_NUMBER_MAX,
  TABLE_NUMBER_MIN,
} from "@/lib/contracts/constants";
import { GuestOrderFlow } from "./GuestOrderFlow";

type MenuPageProps = {
  searchParams: Promise<{ table?: string | string[] }>;
};

function parseTableParam(raw: string | string[] | undefined): number | null {
  if (raw === undefined) return null;
  const s = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < TABLE_NUMBER_MIN || n > TABLE_NUMBER_MAX) {
    return null;
  }
  return n;
}

export default async function MenuPage({ searchParams }: MenuPageProps) {
  const sp = await searchParams;
  const table = parseTableParam(sp.table);

  if (table === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold text-neutral-900">Table required</h1>
        <p className="text-neutral-600">
          Open the menu using your table QR link. It should look like{" "}
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-sm">
            /menu?table=12
          </code>{" "}
          with a table number between {TABLE_NUMBER_MIN} and {TABLE_NUMBER_MAX}.
        </p>
      </main>
    );
  }

  return <GuestOrderFlow table={table} />;
}
