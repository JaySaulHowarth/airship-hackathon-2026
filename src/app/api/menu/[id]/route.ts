import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, MENU_ITEMS_COLLECTION } from "@/lib/db";
import {
  hasStaffPinConfigured,
  isStaffAuthorized,
} from "@/lib/staff-auth";

const patchBodySchema = z.object({
  available: z.boolean(),
});

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

  try {
    const db = await getDb();
    const result = await db.collection(MENU_ITEMS_COLLECTION).updateOne(
      { id },
      { $set: { available: parsed.data.available } },
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id, available: parsed.data.available });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    if (message.includes("MONGODB_URI")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
