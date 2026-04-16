# Table Order — Phase 0 contract

Canonical shapes live in TypeScript + Zod under [`src/lib/contracts/`](src/lib/contracts/index.ts). This document locks **product decisions** and the **HTTP JSON surface** for Phase 1 (Route Handlers) and Phases 2–3 (UI). See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) Phase 0, [PRD.md](./PRD.md), [TECH_STACK.md](./TECH_STACK.md).

## Money (UK)

- Field name: **`price`** (integer **pence**), on menu items and on every persisted order line snapshot (e.g. £5.50 → `550`).
- No separate currency field for MVP.

## Locked product decisions

| Topic | Decision |
|--------|-----------|
| Staff filter UX | **Option A** ([PRD §5.3](./PRD.md)): show orders with ≥1 matching line; list matching lines first; “+N other items” for non-matching lines on the card. |
| Option A — empty filter | **Hide** the order when it has no lines matching the active filter (e.g. drinks-only order hidden in Food). |
| Table validation | Numeric tables **`TABLE_NUMBER_MIN`..`TABLE_NUMBER_MAX`** ([`src/lib/contracts/constants.ts`](src/lib/contracts/constants.ts)); server must reject out-of-range on `POST /api/orders`. |
| Price lock | **At submit**: line snapshots reflect menu **at successful submit** ([`PRICE_LOCK_MOMENT`](src/lib/contracts/constants.ts)). Guest cart may show live menu prices until submit. |
| Order note | Optional `note`; max length **`ORDER_NOTE_MAX_LENGTH`** (align Route Handler + Zod). |

## Domain summary

- **MenuItem:** `id`, `name`, `price` (pence), `kind`, optional `description`, optional stretch `available`.
- **Order (persisted / API list item):** `id`, `table`, `createdAt`, `lines[]`, optional stretch `status`, optional `note`. `lines` each include `menuItemId`, `qty`, snapshot `name`, `price`, `kind`.
- **Create order body:** `table`, `lines` (`menuItemId`, `qty` only); server resolves snapshots from menu at submit. Optional `note`.

Combos: model as **separate line items** in one order ([PRD §5.1](./PRD.md)).

## HTTP API sketch (same-origin `/api/...`)

Auth for `GET /api/orders` is defined in Phase 1 ([TECH_STACK.md](./TECH_STACK.md) §8): e.g. PIN query or cookie; **401** without valid staff secret.

### `GET /api/menu`

- **200** body: `{ "items": MenuItem[] }` (array key **`items`** — fixed convention).

### `POST /api/orders`

- **Body:** `CreateOrderBody` — `table`, `lines` (`menuItemId`, `qty`), optional `note`.
- **Success:** `CreateOrderResponse` — `orderId`, `table`, `createdAt`, `lines` (full snapshots), optional `note`.
- **Errors:** validate non-empty `lines`, table range, optional note length; on failure return appropriate 4xx + body TBD in Phase 1.

### `GET /api/orders`

- **200** body: `{ "orders": Order[] }` with each `Order` matching [`orderSchema`](src/lib/contracts/schemas.ts).
- Sort: **newest first** by server `createdAt` ([PRD §5.1](./PRD.md)).
- Staff **page** URL may be random or PIN-gated ([TECH_STACK.md](./TECH_STACK.md) §8); this endpoint remains **`GET /api/orders`** behind the same secret mechanism decided in Phase 1.

## Zod usage (Phase 1)

- Parse and validate request bodies with [`createOrderBodySchema`](src/lib/contracts/schemas.ts).
- Validate outbound/menu seed data with `menuItemSchema` where helpful.
- Treat `z.string().datetime({ offset: true })` as the wire format for `createdAt`.

## Team sign-off

| Item | Status |
|------|--------|
| Canonical artifact | **TypeScript + Zod** in [`src/lib/contracts/`](src/lib/contracts/index.ts) (no separate OpenAPI file required for MVP). |
| Agreement | Team confirms by review/merge of this contract and the `src/lib/contracts` module. |

## Document history

| Version | Notes |
|---------|--------|
| 1.0 | Phase 0: types, Zod, locked decisions, API sketch. |
