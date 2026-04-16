import { NextResponse } from "next/server";
import { getMenuResponseSchema, menuItemSchema } from "@/lib/contracts/schemas";
import { getDb, MENU_ITEMS_COLLECTION } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();
    const docs = await db
      .collection(MENU_ITEMS_COLLECTION)
      .find({}, { projection: { _id: 0 } })
      .sort({ kind: 1, name: 1 })
      .toArray();

    const items = [];
    for (const doc of docs) {
      const parsed = menuItemSchema.safeParse(doc);
      if (parsed.success) {
        items.push(parsed.data);
      }
    }

    const body = getMenuResponseSchema.parse({ items });
    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("MONGODB_URI")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
