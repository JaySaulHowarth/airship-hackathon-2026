import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  createOrderBodySchema,
  createOrderResponseSchema,
  listOrdersResponseSchema,
  menuItemSchema,
  orderSchema,
} from "@/lib/contracts/schemas";
import type { OrderLineSnapshot } from "@/lib/contracts/types";
import { getDb, MENU_ITEMS_COLLECTION, ORDERS_COLLECTION } from "@/lib/db";
import {
  hasStaffPinConfigured,
  isStaffAuthorized,
} from "@/lib/staff-auth";

export async function GET(request: Request) {
  if (!hasStaffPinConfigured()) {
    return NextResponse.json(
      { error: "STAFF_PIN is not configured on the server" },
      { status: 503 },
    );
  }

  if (!isStaffAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = await getDb();
    const docs = await db
      .collection(ORDERS_COLLECTION)
      .find({}, { projection: { _id: 0 } })
      .sort({ createdAt: 1 })
      .toArray();

    const orders = [];
    for (const doc of docs) {
      const normalized = {
        ...doc,
        createdAt:
          doc.createdAt instanceof Date
            ? doc.createdAt.toISOString()
            : String(doc.createdAt),
      };
      const parsed = orderSchema.safeParse(normalized);
      if (parsed.success) {
        orders.push(parsed.data);
      }
    }

    const body = listOrdersResponseSchema.parse({ orders });
    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("MONGODB_URI")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = createOrderBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid order", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsedBody.data;

  try {
    const db = await getDb();
    const menuCol = db.collection(MENU_ITEMS_COLLECTION);

    const snapshots: OrderLineSnapshot[] = [];
    for (const line of body.lines) {
      const doc = await menuCol.findOne(
        { id: line.menuItemId },
        { projection: { _id: 0 } },
      );
      if (!doc) {
        return NextResponse.json(
          { error: `Unknown menu item: ${line.menuItemId}` },
          { status: 400 },
        );
      }

      const menuParsed = menuItemSchema.safeParse(doc);
      if (!menuParsed.success) {
        return NextResponse.json(
          { error: `Invalid menu data for item: ${line.menuItemId}` },
          { status: 500 },
        );
      }

      const menuItem = menuParsed.data;
      if (menuItem.available === false) {
        return NextResponse.json(
          { error: `Item unavailable: ${menuItem.name}` },
          { status: 400 },
        );
      }

      snapshots.push({
        menuItemId: line.menuItemId,
        qty: line.qty,
        name: menuItem.name,
        price: menuItem.price,
        kind: menuItem.kind,
      });
    }

    const orderId = randomUUID();
    const createdAt = new Date();

    await db.collection(ORDERS_COLLECTION).insertOne({
      id: orderId,
      table: body.table,
      createdAt,
      lines: snapshots,
      ...(body.note !== undefined ? { note: body.note } : {}),
      status: "new",
    });

    const response = createOrderResponseSchema.parse({
      orderId,
      table: body.table,
      createdAt: createdAt.toISOString(),
      lines: snapshots,
      status: "new",
      ...(body.note !== undefined ? { note: body.note } : {}),
    });

    return NextResponse.json(response, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("MONGODB_URI")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
