import type { OrderStatus } from "@/lib/contracts/types";

export function effectiveOrderStatus(
  status: OrderStatus | undefined,
): OrderStatus {
  return status ?? "new";
}

const BADGE_CLASSES: Record<OrderStatus, string> = {
  new: "bg-sky-100 text-sky-900",
  in_progress: "bg-amber-100 text-amber-900",
  completed: "bg-neutral-200 text-neutral-700",
};

const LABEL_STAFF: Record<OrderStatus, string> = {
  new: "New",
  in_progress: "In progress",
  completed: "Done",
};

const LABEL_GUEST: Record<OrderStatus, string> = {
  new: "Received",
  in_progress: "In progress",
  completed: "Completed",
};

export function orderStatusLabel(
  status: OrderStatus,
  variant: "staff" | "guest",
): string {
  return variant === "staff" ? LABEL_STAFF[status] : LABEL_GUEST[status];
}

/** Short line for guests under the status badge. */
export function orderStatusGuestDescription(status: OrderStatus): string {
  switch (status) {
    case "new":
      return "We have your order and will start preparing it soon.";
    case "in_progress":
      return "The team is preparing your order.";
    case "completed":
      return "Your order is ready. Enjoy!";
  }
}

export function OrderStatusBadge({
  status,
  variant,
  className = "",
}: {
  status: OrderStatus;
  variant: "staff" | "guest";
  className?: string;
}) {
  const base =
    "inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";
  return (
    <span
      className={`${base} ${BADGE_CLASSES[status]} ${className}`.trim()}
    >
      {orderStatusLabel(status, variant)}
    </span>
  );
}
