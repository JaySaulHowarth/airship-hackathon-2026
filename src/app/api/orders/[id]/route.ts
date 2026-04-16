import { NextResponse } from "next/server";
import { z } from "zod";
import { orderStatusSchema } from "@/lib/contracts/schemas";
import { getDb, ORDERS_COLLECTION } from "@/lib/db";
import {
  hasStaffPinConfigured,
  isStaffAuthorized,
} from "@/lib/staff-auth";

const patchBodySchema = z.object({
  status: orderStatusSchema,
});

type OrderStatus = z.infer<typeof orderStatusSchema>;

function nextAllowedStatuses(current: OrderStatus | undefined): OrderStatus[] {
  switch (current) {
    case undefined:
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!hasStaffPinConfigured()) {
    return NextResponse.json(
      { error: "STAFF_PIN is not configured on the server" },
      { status: 503 },
    );
  }

  if (!isStaffAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = parsed.data.status;

  try {
    const db = await getDb();
    const col = db.collection(ORDERS_COLLECTION);
    const existing = await col.findOne<{ status?: OrderStatus }>(
      { id },
      { projection: { _id: 0, status: 1 } },
    );

    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const current = existing.status;
    const effective: OrderStatus = current ?? "new";
    if (effective === target) {
      return NextResponse.json({ ok: true, id, status: target });
    }

    const allowed = nextAllowedStatuses(current);
    if (!allowed.includes(target)) {
      return NextResponse.json(
        { error: "Invalid status transition", current, target },
        { status: 409 },
      );
    }

    await col.updateOne({ id }, { $set: { status: target } });

    return NextResponse.json({ ok: true, id, status: target });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("MONGODB_URI")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
