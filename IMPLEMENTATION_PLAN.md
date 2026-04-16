# High-level implementation plan: Table Order (hackathon)

**Timebox:** ~3 hours  
**References:** [PRD](./PRD.md), [Tech stack rationale](./TECH_STACK.md)

This plan follows the PRD execution order (**contract → staff → guest → polish**) and acceptance criteria for a demo-ready build.

---

## Guiding principles

1. **Staff pipeline first** — proves persistence, API, and filters before guest polish.
2. **Server is source of truth** — orders live in SQLite (or chosen store); guest cart is UI state until `POST` succeeds.
3. **Polling over sockets** — `GET /orders` on an interval + manual refresh until core flows are done.
4. **Lock decisions early** — Option **A** vs **B** for staff filters ([PRD §5.3](./PRD.md)); default **Option A** (matching lines first, “+N other items”).

---

## Phase 0 — Contracts and decisions (15–20 min)

**Goal:** Freeze JSON and behavior so frontend and backend can work in parallel.

**Deliverables**

- **Menu item:** `id`, `name`, `priceCents`, `kind: "food" | "drink"`, optional `description`; stretch: `available`.
- **Order:** `id`, `table`, `createdAt`, `lines[]`; stretch: `status` (`new` → `in_progress` → `completed`).
- **Order line:** `menuItemId`, `qty`, plus **snapshot** `name`, `priceCents`, `kind` at submit (stable staff view if menu changes).
- **Staff filter UX:** Confirm **Option A** (recommended) or **Option B** ([PRD §5.3](./PRD.md)).
- **Table validation:** If using numeric tables `1..N`, document max `N` and server-side check ([PRD §8](./PRD.md)).
- **Price lock rule:** Lock at **add-to-cart** or **submit** — pick one ([PRD §8](./PRD.md)).

**Exit criteria:** Written types/interfaces (or OpenAPI sketch) the whole team agrees on.

---

## Phase 1 — Backend, database, seed (45–60 min)

**Goal:** Menu and orders are readable/writable through HTTP with data on disk.

**Deliverables**

- **Schema:** `menu_items`, `orders`, `order_lines` (lines store snapshot fields for demo clarity).
- **`GET /api/menu`** — returns seeded menu (single global menu per [PRD §3](./PRD.md)).
- **`POST /api/orders`** — body: `table`, `lines`, optional `note`; validate non-empty cart, optional table range; **persist**; return `orderId` + echo of payload ([PRD §5.1](./PRD.md)).
- **`GET /api/orders`** — newest first by server `createdAt`; **protect** with PIN/secret ([PRD §7](./PRD.md), [TECH_STACK §8](./TECH_STACK.md)).
- **Seed:** SQL or script to insert initial menu with correct `kind` on every item.

**Stretch (if time in this phase)**

- `PATCH /api/orders/:id` — status transitions.
- `PATCH /api/menu/:id` — `available` toggle ([PRD §5.2](./PRD.md)).

**Exit criteria:** `curl` or REST client can create an order and list it sorted correctly; staff endpoint rejects without auth.

---

## Phase 2 — Staff UI (laptop) (45–60 min)

**Goal:** Staff sees the same orders the API returns, with **All / Food / Drinks** and refresh behavior.

**Deliverables**

- **Order list** — chronological (server order); each card: **time**, **table** (prominent), lines ([PRD §4.2](./PRD.md), [PRD §5.1](./PRD.md)).
- **Filters** — client-side (or query param) over one `GET` payload: **All**, **Food**, **Drinks**; implement chosen Option A or B ([PRD §5.3](./PRD.md)).
- **Option A implementation note:** Show orders with ≥1 matching line; list matching lines first; “+N other items” expand/collapse to full order.
- **Polling** — e.g. 5–10 s interval; **Refresh** button ([PRD §5.1](./PRD.md)).
- **New order emphasis** — e.g. highlight recent `createdAt` or track last-seen id locally ([PRD §4.2](./PRD.md)).
- **Staff gate UX** — PIN entry or bookmarked secret URL per [TECH_STACK](./TECH_STACK.md).

**Stretch**

- Status buttons calling `PATCH`; badge per state ([PRD §5.2](./PRD.md)).
- Simple menu availability toggles ([PRD §5.2](./PRD.md)).

**Exit criteria:** Submitting an order via API (or temporary test form) appears on staff UI within **≤10 s** without redeploy ([PRD §10](./PRD.md)).

---

## Phase 3 — Guest UI (phone) (45–60 min)

**Goal:** QR-driven flow: menu → cart → submit → confirmation.

**Deliverables**

- **Routing** — e.g. `/menu?table=12` or `/t/[table]`; read `table` from URL, **read-only** display ([PRD §3](./PRD.md), [PRD §6](./PRD.md)).
- **Menu** — list from `GET /api/menu`; tap to add; respect stretch `available` if implemented ([PRD §5.1](./PRD.md)).
- **Cart** — qty +/- , subtotal; **block empty submit** ([PRD §5.1](./PRD.md)).
- **Submit** — `POST /api/orders` with `table` + lines; **disable button while in flight** (double-submit) ([PRD §8](./PRD.md)).
- **Errors** — network/submit failure: message + **retain cart** ([PRD §7](./PRD.md)).
- **Success** — confirmation with **order id** ([PRD §4.1](./PRD.md)).

**Exit criteria:** Phone on LAN completes flow; staff laptop shows same order with correct table ([PRD §10](./PRD.md)).

---

## Phase 4 — Demo hardening (15–30 min)

**Goal:** Judges and teammates can run and follow the demo without debugging secrets.

**Deliverables**

- **README** — single command to run app + API; **LAN base URL** for QR; example URLs with `?table=`; how to open staff view with PIN ([PRD §7](./PRD.md)).
- **Smoke test** — guest phone → order appears staff side within SLA ([PRD §10](./PRD.md)).
- **Optional:** ngrok or tunnel only if off-LAN access needed ([PRD §9](./PRD.md)).

**Exit criteria:** Someone not on the team can run README and hit guest + staff paths.

---

## Phase 5 — Stretch (remaining time)

**Priority order (suggested)**

1. **Order status** — `new` / `in_progress` / `completed` on staff cards ([PRD §5.2](./PRD.md)).
2. **Menu availability** — staff toggle + guest “sold out” / disabled ([PRD §5.2](./PRD.md)).
3. **Visual polish** — typography, spacing, obvious CTAs on guest; dense readable staff layout ([PRD §11](./PRD.md)).

**Exit criteria:** Stretch features do not break MVP paths; demo script updated.

---

## PRD alignment checklist

Use this before calling the build “done” for judging.

| Item | PRD reference |
|------|----------------|
| Orders persisted **server-side**, not only guest `localStorage` | [§5.1](./PRD.md), [§9](./PRD.md) |
| Sort orders by **server** `createdAt` | [§8](./PRD.md) |
| Table from **QR/URL**, echoed on staff | [§3](./PRD.md), [§10](./PRD.md) |
| **Food / Drinks** filter behavior matches chosen Option A/B | [§5.3](./PRD.md), [§10](./PRD.md) |
| Submit **disabled while submitting**; cart retained on failure | [§8](./PRD.md), [§7](./PRD.md) |
| Staff route not trivially guessable without PIN/secret | [§7](./PRD.md) |

---

## Document history

| Version | Notes |
|---------|--------|
| 1.0 | Initial high-level plan from hackathon scaffolding. |
