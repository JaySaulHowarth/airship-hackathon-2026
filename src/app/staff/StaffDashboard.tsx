"use client";

import {
  getMenuResponseSchema,
  listOrdersResponseSchema,
} from "@/lib/contracts/schemas";
import type {
  MenuItem,
  Order,
  OrderLineSnapshot,
  OrderStatus,
} from "@/lib/contracts/types";
import { formatPenceGBP } from "@/lib/format-money";
import { OrderStatusBadge, effectiveOrderStatus } from "@/lib/order-status";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StaffFilter = "all" | "food" | "drink" | "done";

const POLL_MS = 8000;

function orderHasKind(order: Order, kind: "food" | "drink"): boolean {
  return order.lines.some((l) => l.kind === kind);
}

function filterOrdersForTab(orders: Order[], filter: StaffFilter): Order[] {
  if (filter === "done") {
    return orders.filter((o) => effectiveOrderStatus(o.status) === "completed");
  }
  const active = orders.filter(
    (o) => effectiveOrderStatus(o.status) !== "completed",
  );
  if (filter === "all") return active;
  return active.filter((o) => orderHasKind(o, filter));
}

function partitionLines(
  order: Order,
  filter: "food" | "drink",
): { matching: OrderLineSnapshot[]; other: OrderLineSnapshot[] } {
  const matching = order.lines.filter((l) => l.kind === filter);
  const other = order.lines.filter((l) => l.kind !== filter);
  return { matching, other };
}

function nextAllowedStatuses(current: OrderStatus | undefined): OrderStatus[] {
  switch (current ?? "new") {
    case "new":
      return ["in_progress", "completed"];
    case "in_progress":
      return ["completed"];
    case "completed":
      return [];
    default:
      return [];
  }
}

function formatOrderTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ordersUrl(pin: string | null): string {
  if (pin) {
    return `/api/orders?pin=${encodeURIComponent(pin)}`;
  }
  return "/api/orders";
}

export function StaffDashboard() {
  const searchParams = useSearchParams();
  const pinFromUrl = searchParams.get("pin");

  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filter, setFilter] = useState<StaffFilter>("all");
  const [gateError, setGateError] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState("");
  /** True until the initial cookie / orders probe finishes (not the same as signing in). */
  const [sessionCheckPending, setSessionCheckPending] = useState(true);
  const [signInSubmitting, setSignInSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [expandedOthers, setExpandedOthers] = useState<Record<string, boolean>>(
    {},
  );
  const [noteExpanded, setNoteExpanded] = useState<Record<string, boolean>>({});
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [statusBusy, setStatusBusy] = useState<Record<string, boolean>>({});
  const [menuToggleBusy, setMenuToggleBusy] = useState<Record<string, boolean>>(
    {},
  );

  const previousPollIdsRef = useRef<Set<string> | null>(null);
  const highlightTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const pinBootstrapRef = useRef<string | null>(pinFromUrl);

  const visibleOrders = useMemo(
    () => filterOrdersForTab(orders, filter),
    [orders, filter],
  );

  const addHighlights = useCallback((newIds: string[]) => {
    if (newIds.length === 0) return;
    setHighlightedIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) {
        next.add(id);
      }
      return next;
    });
    for (const id of newIds) {
      const existing = highlightTimeoutsRef.current.get(id);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        setHighlightedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        highlightTimeoutsRef.current.delete(id);
      }, 90_000);
      highlightTimeoutsRef.current.set(id, t);
    }
  }, []);

  const processOrdersPayload = useCallback(
    (nextOrders: Order[], opts?: { isManualRefresh?: boolean }) => {
      if (opts?.isManualRefresh) {
        setHighlightedIds(new Set());
        for (const t of highlightTimeoutsRef.current.values()) {
          clearTimeout(t);
        }
        highlightTimeoutsRef.current.clear();
        previousPollIdsRef.current = new Set(nextOrders.map((o) => o.id));
        setOrders(nextOrders);
        return;
      }

      const currentIds = new Set(nextOrders.map((o) => o.id));
      const prev = previousPollIdsRef.current;

      if (prev === null) {
        previousPollIdsRef.current = currentIds;
        setOrders(nextOrders);
        return;
      }

      const newlyAppeared: string[] = [];
      for (const id of currentIds) {
        if (!prev.has(id)) newlyAppeared.push(id);
      }
      previousPollIdsRef.current = currentIds;
      setOrders(nextOrders);
      addHighlights(newlyAppeared);
    },
    [addHighlights],
  );

  const loadOrders = useCallback(
    async (opts?: {
      pin?: string | null;
      isManualRefresh?: boolean;
      silent?: boolean;
    }) => {
      const pin = opts?.pin ?? null;
      if (!opts?.silent) {
        if (opts?.isManualRefresh) {
          setRefreshing(true);
        }
      }
      setLoadError(null);

      try {
        const res = await fetch(ordersUrl(pin), {
          credentials: "include",
        });

        if (res.status === 401) {
          setAuthed(false);
          setOrders([]);
          previousPollIdsRef.current = null;
          if (!opts?.silent) {
            setGateError("Enter the staff PIN to continue.");
          }
          return;
        }

        if (res.status === 503) {
          const j = (await res.json()) as { error?: string };
          setConfigError(j.error ?? "Server unavailable");
          setAuthed(false);
          return;
        }

        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setLoadError(j.error ?? `Request failed (${res.status})`);
          return;
        }

        const json: unknown = await res.json();
        const parsed = listOrdersResponseSchema.safeParse(json);
        if (!parsed.success) {
          setLoadError("Invalid orders response from server");
          return;
        }

        setAuthed(true);
        setConfigError(null);
        setGateError(null);
        processOrdersPayload(parsed.data.orders, {
          isManualRefresh: opts?.isManualRefresh,
        });
      } catch {
        setLoadError("Network error loading orders");
      } finally {
        if (!opts?.silent) {
          setRefreshing(false);
        }
      }
    },
    [processOrdersPayload],
  );

  /** After GET with URL pin succeeds, set cookie so polls stay authorized. */
  const establishSession = useCallback(async (pin: string) => {
    const res = await fetch("/api/staff/session", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    return res.ok;
  }, []);

  const submitPin = useCallback(async () => {
    setGateError(null);
    setLoadError(null);
    setConfigError(null);
    setSignInSubmitting(true);
    try {
      const res = await fetch("/api/staff/session", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput }),
      });

      if (res.status === 503) {
        const j = (await res.json()) as { error?: string };
        setConfigError(j.error ?? "STAFF_PIN is not configured");
        return;
      }

      if (!res.ok) {
        setGateError("Incorrect PIN");
        return;
      }

      await loadOrders({ pin: null });
    } finally {
      setSignInSubmitting(false);
    }
  }, [loadOrders, pinInput]);

  const loadMenu = useCallback(async () => {
    try {
      const res = await fetch("/api/menu");
      if (!res.ok) return;
      const json: unknown = await res.json();
      const parsed = getMenuResponseSchema.safeParse(json);
      if (parsed.success) {
        setMenuItems(parsed.data.items);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setSessionCheckPending(true);
      setConfigError(null);
      setGateError(null);

      try {
        const bootstrapPin = pinBootstrapRef.current;
        const res = await fetch(ordersUrl(bootstrapPin), { credentials: "include" });

        if (cancelled) return;

        if (res.status === 503) {
          const j = (await res.json()) as { error?: string };
          setConfigError(j.error ?? "Server unavailable");
          return;
        }

        if (res.status === 401) {
          setAuthed(false);
          setGateError(
            bootstrapPin
              ? "PIN in URL was not accepted. Enter PIN below."
              : "Enter the staff PIN to continue.",
          );
          return;
        }

        if (!res.ok) {
          setLoadError(`Could not load orders (${res.status})`);
          return;
        }

        let json: unknown;
        try {
          json = await res.json();
        } catch {
          if (!cancelled) setLoadError("Invalid response from server");
          return;
        }

        if (cancelled) return;

        const parsed = listOrdersResponseSchema.safeParse(json);
        if (!parsed.success) {
          setLoadError("Invalid orders response");
          return;
        }

        if (bootstrapPin) {
          const sessionOk = await establishSession(bootstrapPin);
          if (cancelled) return;
          if (!sessionOk) {
            setLoadError("Could not save staff session; try signing in with PIN.");
            return;
          }
        }

        if (cancelled) return;

        setAuthed(true);
        setGateError(null);
        processOrdersPayload(parsed.data.orders);
      } catch {
        if (!cancelled) {
          setLoadError("Network error while checking session");
        }
      } finally {
        if (!cancelled) {
          setSessionCheckPending(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [establishSession, processOrdersPayload]);

  useEffect(() => {
    if (!authed || configError) return;

    const id = setInterval(() => {
      void loadOrders({ pin: null, silent: true });
    }, POLL_MS);

    return () => clearInterval(id);
  }, [authed, configError, loadOrders]);

  useEffect(() => {
    return () => {
      for (const t of highlightTimeoutsRef.current.values()) {
        clearTimeout(t);
      }
    };
  }, []);

  const onRefresh = () => {
    void loadOrders({ pin: null, isManualRefresh: true });
  };

  const patchOrderStatus = async (orderId: string, status: OrderStatus) => {
    setStatusBusy((b) => ({ ...b, [orderId]: true }));
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(j.error ?? `Could not update order (${res.status})`);
        return;
      }
      await loadOrders({ pin: null, silent: true });
    } catch {
      setLoadError("Network error updating order");
    } finally {
      setStatusBusy((b) => ({ ...b, [orderId]: false }));
    }
  };

  const patchMenuAvailable = async (itemId: string, available: boolean) => {
    setMenuToggleBusy((b) => ({ ...b, [itemId]: true }));
    try {
      const res = await fetch(`/api/menu/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ available }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(j.error ?? `Could not update menu (${res.status})`);
        return;
      }
      await loadMenu();
    } catch {
      setLoadError("Network error updating menu");
    } finally {
      setMenuToggleBusy((b) => ({ ...b, [itemId]: false }));
    }
  };

  useEffect(() => {
    if (menuOpen && authed) {
      void loadMenu();
    }
  }, [menuOpen, authed, loadMenu]);

  if (configError) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold text-neutral-900">Staff unavailable</h1>
        <p className="mt-2 text-neutral-600">{configError}</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Staff sign-in
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Enter the venue PIN. Session uses a secure cookie on this device.
          </p>
          {sessionCheckPending ? (
            <p className="mt-2 text-xs text-neutral-500">Checking saved session…</p>
          ) : null}
        </div>
        {loadError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {loadError}
          </p>
        ) : null}
        {gateError ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {gateError}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-neutral-800" htmlFor="staff-pin">
            PIN
          </label>
          <input
            id="staff-pin"
            type="password"
            autoComplete="one-time-code"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submitPin();
            }}
            className="rounded-md border border-neutral-300 px-3 py-2 text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
          />
          <button
            type="button"
            disabled={signInSubmitting || pinInput.length === 0}
            onClick={() => void submitPin()}
            className="rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {signInSubmitting ? "Signing in…" : "Continue"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-neutral-100 text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Order queue</h1>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-sm">
              {(
                [
                  ["all", "All"],
                  ["food", "Food"],
                  ["drink", "Drinks"],
                  ["done", "Done"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-md px-3 py-1.5 font-medium transition ${
                    filter === key
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
            >
              {menuOpen ? "Hide menu" : "Menu availability"}
            </button>
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-4xl px-4 text-xs text-neutral-500">
          Updates every {POLL_MS / 1000}s · New orders highlighted briefly (clears on
          Refresh)
        </p>
      </header>

      {loadError ? (
        <div className="mx-auto max-w-4xl px-4 pt-3">
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            {loadError}
          </p>
        </div>
      ) : null}

      {menuOpen ? (
        <section className="mx-auto max-w-4xl border-b border-neutral-200 bg-white px-4 py-4">
          <h2 className="text-sm font-semibold text-neutral-800">Menu availability</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Toggle sold-out state. Guest UI can respect this in a later phase.
          </p>
          {!menuItems ? (
            <p className="mt-3 text-sm text-neutral-500">Loading menu…</p>
          ) : (
            <ul className="mt-3 max-h-48 divide-y divide-neutral-100 overflow-y-auto rounded-md border border-neutral-200">
              {menuItems.map((item) => {
                const available = item.available !== false;
                const busy = menuToggleBusy[item.id];
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{item.name}</span>
                      <span className="ml-2 text-neutral-500">
                        {item.kind} · {formatPenceGBP(item.price)}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void patchMenuAvailable(item.id, !available)}
                      className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
                        available
                          ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                          : "bg-neutral-200 text-neutral-700 hover:bg-neutral-300"
                      } disabled:opacity-50`}
                    >
                      {busy ? "…" : available ? "Available" : "Sold out"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      <div className="mx-auto max-w-4xl space-y-3 p-4">
        {sessionCheckPending && orders.length === 0 ? (
          <p className="text-sm text-neutral-500">Loading orders…</p>
        ) : visibleOrders.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-500">
            No orders for this filter.
          </p>
        ) : (
          visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              filter={filter}
              highlighted={highlightedIds.has(order.id)}
              expandedOthers={expandedOthers[order.id] ?? false}
              onToggleOthers={() =>
                setExpandedOthers((e) => ({ ...e, [order.id]: !e[order.id] }))
              }
              noteExpanded={noteExpanded[order.id] ?? false}
              onToggleNote={() =>
                setNoteExpanded((e) => ({ ...e, [order.id]: !e[order.id] }))
              }
              onPatchStatus={(s) => void patchOrderStatus(order.id, s)}
              statusBusy={statusBusy[order.id] ?? false}
            />
          ))
        )}
      </div>
    </main>
  );
}

type OrderCardProps = {
  order: Order;
  filter: StaffFilter;
  highlighted: boolean;
  expandedOthers: boolean;
  onToggleOthers: () => void;
  noteExpanded: boolean;
  onToggleNote: () => void;
  onPatchStatus: (s: OrderStatus) => void;
  statusBusy: boolean;
};

function OrderCard({
  order,
  filter,
  highlighted,
  expandedOthers,
  onToggleOthers,
  noteExpanded,
  onToggleNote,
  onPatchStatus,
  statusBusy,
}: OrderCardProps) {
  const status: OrderStatus = effectiveOrderStatus(order.status);
  const nextActions = nextAllowedStatuses(order.status);

  const linesBlock =
    filter === "all" || filter === "done" ? (
      <ul className="mt-2 space-y-1 text-sm">
        {order.lines.map((line, i) => (
          <li key={`${line.menuItemId}-${i}`} className="flex justify-between gap-3">
            <span>
              <span className="font-medium text-neutral-900">{line.qty}×</span>{" "}
              {line.name}
              <span className="ml-2 text-xs text-neutral-500">({line.kind})</span>
            </span>
            <span className="shrink-0 text-neutral-600">
              {formatPenceGBP(line.price * line.qty)}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <FilteredLines
        order={order}
        kind={filter}
        expandedOthers={expandedOthers}
        onToggleOthers={onToggleOthers}
      />
    );

  return (
    <article
      className={`rounded-lg border bg-white p-4 shadow-sm transition ${
        highlighted
          ? "border-l-4 border-l-amber-400 border-neutral-200 ring-1 ring-amber-100"
          : "border-neutral-200"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
            Table
          </p>
          <p className="text-3xl font-bold tabular-nums text-neutral-900">
            {order.table}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-500">{formatOrderTime(order.createdAt)}</p>
          <p className="mt-1 font-mono text-xs text-neutral-400" title="Order id">
            {order.id.slice(0, 8)}…
          </p>
          <OrderStatusBadge status={status} variant="staff" className="mt-2" />
        </div>
      </div>

      {order.note ? (
        <div className="mt-2 border-t border-neutral-100 pt-2">
          <button
            type="button"
            onClick={onToggleNote}
            className="text-left text-xs font-medium text-neutral-600 hover:text-neutral-900"
          >
            Note {noteExpanded ? "▼" : "▶"}
          </button>
          {noteExpanded ? (
            <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
              {order.note}
            </p>
          ) : (
            <p className="mt-1 truncate text-sm text-neutral-600">{order.note}</p>
          )}
        </div>
      ) : null}

      {linesBlock}

      {nextActions.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {nextActions.map((s) => (
            <button
              key={s}
              type="button"
              disabled={statusBusy}
              onClick={() => onPatchStatus(s)}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
            >
              {statusBusy
                ? "…"
                : s === "in_progress"
                  ? "In progress"
                  : s === "completed"
                    ? "Completed"
                    : s}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function FilteredLines({
  order,
  kind,
  expandedOthers,
  onToggleOthers,
}: {
  order: Order;
  kind: "food" | "drink";
  expandedOthers: boolean;
  onToggleOthers: () => void;
}) {
  const { matching, other } = partitionLines(order, kind);
  const n = other.length;

  return (
    <div className="mt-2 space-y-2 text-sm">
      <ul className="space-y-1">
        {matching.map((line, i) => (
          <li key={`m-${line.menuItemId}-${i}`} className="flex justify-between gap-3">
            <span>
              <span className="font-medium text-neutral-900">{line.qty}×</span>{" "}
              {line.name}
            </span>
            <span className="shrink-0 text-neutral-600">
              {formatPenceGBP(line.price * line.qty)}
            </span>
          </li>
        ))}
      </ul>
      {n > 0 ? (
        <div>
          <button
            type="button"
            onClick={onToggleOthers}
            className="text-xs font-medium text-neutral-600 underline decoration-neutral-300 hover:text-neutral-900"
          >
            {expandedOthers ? "Hide" : `+${n} other item${n === 1 ? "" : "s"}`}
          </button>
          {expandedOthers ? (
            <ul className="mt-1 space-y-1 border-l-2 border-neutral-200 pl-3 text-neutral-600">
              {other.map((line, i) => (
                <li
                  key={`o-${line.menuItemId}-${i}`}
                  className="flex justify-between gap-3"
                >
                  <span>
                    {line.qty}× {line.name}
                    <span className="ml-2 text-xs">({line.kind})</span>
                  </span>
                  <span className="shrink-0">
                    {formatPenceGBP(line.price * line.qty)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
