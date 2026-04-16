import { createHmac, timingSafeEqual } from "crypto";

export const STAFF_SESSION_COOKIE = "table_order_staff";
const STAFF_COOKIE_HMAC_LABEL = "table_order_staff_v1";

function getStaffPin(): string | undefined {
  const pin = process.env.STAFF_PIN;
  return pin && pin.length > 0 ? pin : undefined;
}

function expectedStaffCookieValue(pin: string): string {
  return createHmac("sha256", pin).update(STAFF_COOKIE_HMAC_LABEL).digest("base64url");
}

function timingSafeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** Timing-safe comparison for the configured staff PIN. */
export function verifyStaffPin(candidate: string): boolean {
  const pin = getStaffPin();
  if (!pin) {
    return false;
  }
  return timingSafeEqualString(candidate, pin);
}

/**
 * Validates staff access for protected routes (e.g. `GET /api/orders`).
 * Accepts: query `pin`, `Authorization: Bearer <pin>`, or httpOnly cookie from `POST /api/staff/session`.
 */
export function isStaffAuthorized(request: Request): boolean {
  const pin = getStaffPin();
  if (!pin) {
    return false;
  }

  const url = new URL(request.url);
  const queryPin = url.searchParams.get("pin");
  if (queryPin && verifyStaffPin(queryPin)) {
    return true;
  }

  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token && verifyStaffPin(token)) {
      return true;
    }
  }

  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${STAFF_SESSION_COOKIE}=([^;]+)`),
    );
    if (match?.[1]) {
      const value = decodeURIComponent(match[1]);
      if (timingSafeEqualString(value, expectedStaffCookieValue(pin))) {
        return true;
      }
    }
  }

  return false;
}

export function getStaffCookieValue(): string | null {
  const pin = getStaffPin();
  if (!pin) {
    return null;
  }
  return expectedStaffCookieValue(pin);
}

export function hasStaffPinConfigured(): boolean {
  return Boolean(getStaffPin());
}
