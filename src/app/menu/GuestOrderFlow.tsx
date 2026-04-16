"use client";

import { ORDER_NOTE_MAX_LENGTH } from "@/lib/contracts";
import {
  createOrderResponseSchema,
  getMenuResponseSchema,
  orderSchema,
} from "@/lib/contracts/schemas";
import type {
  CreateOrderResponse,
  MenuItem,
  Order,
} from "@/lib/contracts/types";
import { formatPenceGBP } from "@/lib/format-money";
import {
  OrderStatusBadge,
  effectiveOrderStatus,
  orderStatusGuestDescription,
} from "@/lib/order-status";
import { useCallback, useEffect, useMemo, useState } from "react";

const ORDER_POLL_MS = 8000;
const MENU_POLL_MS = 8000;

function orderFromCreateResponse(r: CreateOrderResponse): Order {
  return {
    id: r.orderId,
    table: r.table,
    createdAt: r.createdAt,
    lines: r.lines,
    status: r.status,
    ...(r.note !== undefined ? { note: r.note } : {}),
  };
}

type Cart = Record<string, number>;

type GuestOrderFlowProps = {
  table: number;
};

export function GuestOrderFlow({ table }: GuestOrderFlowProps) {
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuPollError, setMenuPollError] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<CreateOrderResponse | null>(null);
  const [liveOrder, setLiveOrder] = useState<Order | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [statusRefreshing, setStatusRefreshing] = useState(false);

  const loadMenu = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    if (!silent) {
      setMenuError(null);
    }
    try {
      const res = await fetch("/api/menu");
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `Could not load menu (${res.status})`;
        if (silent) {
          setMenuPollError(msg);
          return;
        }
        setMenuError(msg);
        setItems(null);
        return;
      }
      const parsed = getMenuResponseSchema.safeParse(json);
      if (!parsed.success) {
        if (silent) {
          setMenuPollError("Menu data was invalid. Try refresh.");
          return;
        }
        setMenuError("Menu data was invalid. Please refresh.");
        setItems(null);
        return;
      }
      const nextItems = parsed.data.items;
      setItems(nextItems);
      setMenuPollError(null);
      setMenuError(null);
      setCart((prev) => {
        const purchasable = new Set(
          nextItems
            .filter((i) => i.available !== false)
            .map((i) => i.id),
        );
        const next = { ...prev };
        let changed = false;
        for (const id of Object.keys(next)) {
          if (!purchasable.has(id)) {
            delete next[id];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    } catch {
      if (silent) {
        setMenuPollError("Could not refresh menu. Check your connection.");
        return;
      }
      setMenuError("Network error loading menu. Check your connection.");
      setItems(null);
    }
  }, []);

  useEffect(() => {
    void loadMenu();
  }, [loadMenu]);

  useEffect(() => {
    if (success) return;
    const id = window.setInterval(() => void loadMenu({ silent: true }), MENU_POLL_MS);
    return () => window.clearInterval(id);
  }, [success, loadMenu]);

  const itemById = useMemo(() => {
    const m = new Map<string, MenuItem>();
    for (const it of items ?? []) m.set(it.id, it);
    return m;
  }, [items]);

  const subtotalPence = useMemo(() => {
    let t = 0;
    for (const [id, qty] of Object.entries(cart)) {
      const it = itemById.get(id);
      if (it && qty > 0) t += it.price * qty;
    }
    return t;
  }, [cart, itemById]);

  const cartLineCount = useMemo(
    () => Object.values(cart).reduce((a, q) => a + (q > 0 ? q : 0), 0),
    [cart],
  );

  const setQty = useCallback((menuItemId: string, next: number) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (next <= 0) delete copy[menuItemId];
      else copy[menuItemId] = next;
      return copy;
    });
  }, []);

  const addOne = useCallback((menuItemId: string) => {
    setCart((prev) => ({
      ...prev,
      [menuItemId]: (prev[menuItemId] ?? 0) + 1,
    }));
  }, []);

  const submit = useCallback(async () => {
    const lines = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([menuItemId, qty]) => ({ menuItemId, qty }));
    if (lines.length === 0) return;

    setSubmitError(null);
    setSubmitting(true);
    try {
      const body: {
        table: number;
        lines: { menuItemId: string; qty: number }[];
        note?: string;
      } = { table, lines };
      const trimmed = note.trim();
      if (trimmed) body.note = trimmed;

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const msg =
          json &&
          typeof json === "object" &&
          "error" in json &&
          typeof (json as { error: unknown }).error === "string"
            ? (json as { error: string }).error
            : `Order failed (${res.status}). Try again.`;
        setSubmitError(msg);
        return;
      }

      const parsed = createOrderResponseSchema.safeParse(json);
      if (!parsed.success) {
        setSubmitError("Unexpected response from server. Your cart is unchanged.");
        return;
      }
      setSuccess(parsed.data);
      setCart({});
      setNote("");
    } catch {
      setSubmitError("Network error. Your cart is unchanged.");
    } finally {
      setSubmitting(false);
    }
  }, [cart, note, table]);

  const loadOrderFromServer = useCallback(async (): Promise<Order> => {
    if (!success) {
      throw new Error("No active order.");
    }
    const url = `/api/orders/${encodeURIComponent(success.orderId)}?table=${encodeURIComponent(String(table))}`;
    const res = await fetch(url);
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        json &&
        typeof json === "object" &&
        "error" in json &&
        typeof (json as { error: unknown }).error === "string"
          ? (json as { error: string }).error
          : `Could not load status (${res.status})`;
      throw new Error(msg);
    }
    const parsed = orderSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error("Invalid order data from server.");
    }
    return parsed.data;
  }, [success, table]);

  useEffect(() => {
    if (!success) {
      setLiveOrder(null);
      setPollError(null);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const data = await loadOrderFromServer();
        if (!cancelled) {
          setLiveOrder(data);
          setPollError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPollError(
            e instanceof Error ? e.message : "Could not refresh status.",
          );
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), ORDER_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [success, loadOrderFromServer]);

  const refreshStatus = useCallback(async () => {
    if (!success) return;
    setPollError(null);
    setStatusRefreshing(true);
    try {
      const data = await loadOrderFromServer();
      setLiveOrder(data);
      setPollError(null);
    } catch (e) {
      setPollError(e instanceof Error ? e.message : "Could not refresh status.");
    } finally {
      setStatusRefreshing(false);
    }
  }, [success, loadOrderFromServer]);

  if (success) {
    const displayOrder = liveOrder ?? orderFromCreateResponse(success);
    const status = effectiveOrderStatus(displayOrder.status);

    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 p-6 pb-10">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <p className="text-sm font-medium text-emerald-800">Order sent</p>
          <div className="mt-3 flex flex-col items-center gap-2">
            <OrderStatusBadge status={status} variant="guest" />
            <p className="max-w-sm text-sm text-emerald-900">
              {orderStatusGuestDescription(status)}
            </p>
          </div>
          <p className="mt-4 text-2xl font-semibold tracking-tight text-emerald-950">
            {success.orderId}
          </p>
          <p className="mt-3 text-sm text-emerald-900">
            Table <span className="font-semibold">{success.table}</span> — show
            this reference if staff ask.
          </p>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              disabled={statusRefreshing}
              className="min-h-11 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-medium text-emerald-950 active:bg-emerald-100 disabled:opacity-60"
              onClick={() => void refreshStatus()}
            >
              {statusRefreshing ? "Refreshing…" : "Refresh status"}
            </button>
          </div>
        </div>
        {pollError ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-950"
            role="status"
          >
            {pollError}
          </div>
        ) : null}
        <p className="text-center text-sm text-neutral-600">
          You can close this page. Need another round?{" "}
          <button
            type="button"
            className="font-medium text-neutral-900 underline decoration-neutral-400 underline-offset-2"
            onClick={() => setSuccess(null)}
          >
            Order again
          </button>
        </p>
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
              Menu
            </h1>
            <p className="text-sm text-neutral-600">
              Table{" "}
              <span className="rounded-md bg-neutral-900 px-2 py-0.5 font-semibold text-white">
                {table}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadMenu()}
            className="min-h-11 min-w-11 shrink-0 rounded-xl border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-800 active:bg-neutral-50"
          >
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 space-y-4 px-4 pb-40 pt-4">
        {menuError ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
            role="alert"
          >
            <p className="font-medium">Menu unavailable</p>
            <p className="mt-1 text-amber-900">{menuError}</p>
            <button
              type="button"
              className="mt-3 min-h-11 w-full rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white active:bg-amber-950"
              onClick={() => void loadMenu()}
            >
              Try again
            </button>
          </div>
        ) : null}

        {menuPollError && !menuError ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-950"
            role="status"
          >
            {menuPollError}
          </div>
        ) : null}

        {submitError ? (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950"
            role="alert"
          >
            <p className="font-medium">Could not place order</p>
            <p className="mt-1 text-red-900">{submitError}</p>
          </div>
        ) : null}

        {!items && !menuError ? (
          <p className="py-8 text-center text-neutral-500">Loading menu…</p>
        ) : null}

        {items?.map((item) => {
          const soldOut = item.available === false;
          const qty = cart[item.id] ?? 0;
          return (
            <article
              key={item.id}
              className={`rounded-2xl border p-4 ${
                soldOut
                  ? "border-neutral-200 bg-neutral-50 opacity-80"
                  : "border-neutral-200 bg-white shadow-sm"
              }`}
            >
              <div className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h2 className="text-base font-semibold text-neutral-900">
                      {item.name}
                    </h2>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                        item.kind === "food"
                          ? "bg-orange-100 text-orange-900"
                          : "bg-sky-100 text-sky-900"
                      }`}
                    >
                      {item.kind}
                    </span>
                  </div>
                  {item.description ? (
                    <p className="mt-1 text-sm text-neutral-600">{item.description}</p>
                  ) : null}
                  <p className="mt-2 text-sm font-medium text-neutral-900">
                    {formatPenceGBP(item.price)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-center gap-2">
                  {soldOut ? (
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      Sold out
                    </span>
                  ) : qty === 0 ? (
                    <button
                      type="button"
                      onClick={() => addOne(item.id)}
                      className="min-h-12 min-w-[4.5rem] rounded-xl bg-neutral-900 px-4 text-sm font-semibold text-white active:bg-neutral-800"
                    >
                      Add
                    </button>
                  ) : (
                    <div className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-lg font-medium text-neutral-900 active:bg-neutral-200"
                        onClick={() => setQty(item.id, qty - 1)}
                      >
                        −
                      </button>
                      <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums">
                        {qty}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-lg font-medium text-neutral-900 active:bg-neutral-200"
                        onClick={() => setQty(item.id, qty + 1)}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        <div className="space-y-2">
          <label htmlFor="order-note" className="text-sm font-medium text-neutral-800">
            Special requests{" "}
            <span className="font-normal text-neutral-500">(optional)</span>
          </label>
          <textarea
            id="order-note"
            rows={3}
            maxLength={ORDER_NOTE_MAX_LENGTH}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Allergies, ice, etc."
            className="w-full resize-y rounded-xl border border-neutral-300 px-3 py-2 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
          <p className="text-right text-xs text-neutral-500">
            {note.length}/{ORDER_NOTE_MAX_LENGTH}
          </p>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-neutral-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <div className="mx-auto flex max-w-lg items-end justify-between gap-4">
          <div>
            <p className="text-xs text-neutral-500">Subtotal</p>
            <p className="text-lg font-semibold tabular-nums text-neutral-900">
              {formatPenceGBP(subtotalPence)}
            </p>
            {cartLineCount > 0 ? (
              <p className="text-xs text-neutral-500">{cartLineCount} items</p>
            ) : null}
          </div>
          <button
            type="button"
            disabled={
              cartLineCount === 0 ||
              submitting ||
              items === null ||
              menuError !== null
            }
            onClick={() => void submit()}
            className="min-h-12 min-w-[8.5rem] shrink-0 rounded-xl bg-emerald-700 px-5 text-base font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:text-neutral-500 active:bg-emerald-800"
          >
            {submitting ? "Sending…" : "Submit order"}
          </button>
        </div>
      </footer>
    </div>
  );
}
