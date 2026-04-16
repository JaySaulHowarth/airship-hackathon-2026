import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getStaffCookieValue,
  hasStaffPinConfigured,
  STAFF_SESSION_COOKIE,
  verifyStaffPin,
} from "@/lib/staff-auth";

const bodySchema = z.object({
  pin: z.string().min(1),
});

export async function POST(request: Request) {
  if (!hasStaffPinConfigured()) {
    return NextResponse.json(
      { error: "STAFF_PIN is not configured on the server" },
      { status: 503 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const cookieValue = getStaffCookieValue();
  if (!cookieValue) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 503 });
  }

  if (!verifyStaffPin(parsed.data.pin)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STAFF_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
