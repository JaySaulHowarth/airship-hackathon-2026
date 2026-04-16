# Tech stack rationale: Table Order (hackathon)

This document explains **what** we propose to use and **why** each choice fits the [PRD](./PRD.md): ~3 hours, **no payments**, guest on **phone** (QR + table in URL), staff on **laptop**, **single menu**, **server-persisted orders**, **All / Food / Drinks** filtering on one queue, **polling** over complex realtime, and **light staff protection**.

---

## 1. Stack overview

| Concern | Technology | Primary purpose |
|--------|------------|-----------------|
| Application framework | **Next.js** (App Router) | Web UI + HTTP API in one deployable unit |
| Language | **TypeScript** | Shared types for API, menu, orders, filters |
| Styling | **Tailwind CSS** | Fast, consistent mobile vs laptop layouts |
| Persistence | **MongoDB** | Durable orders and seeded menu (documents + collections) |
| Data access | **`mongodb` Node driver** (+ **Zod** for request/response shapes) | Typed inserts/queries from Route Handlers without SQL migrations |
| Updates to staff | **HTTP short polling** + manual refresh | New orders without WebSocket complexity |
| Staff access control | **Env secret + PIN query or cookie** | Non-guessable staff surface for demos |
| Local / phone testing | **Same-origin API** (Next Route Handlers) | Fewer CORS and LAN URL issues |

---

## 2. Next.js (App Router)

**Purpose:** Deliver both **guest** and **staff** experiences and the **backend API** from one codebase and one dev server.

**Why it suits this project**

- **PRD:** One venue, one menu, two distinct UIs (dense laptop vs thumb-friendly phone) — Next.js supports multiple routes (`/menu`, `/staff/...`) and shared components without spinning up two repos ([PRD §3–4](./PRD.md)).
- **PRD:** Orders must be **persisted server-side** so staff can read them — **Route Handlers** (`app/api/...`) give you `GET /menu`, `POST /orders`, `GET /orders` next to the UI ([PRD §5.1](./PRD.md)).
- **Hackathon time:** Single `npm run dev`, one README “how to run,” aligns with operability ([PRD §7](./PRD.md)).
- **QR flows:** Query-based URLs (`/menu?table=12`) or dynamic segments (`/t/[table]`) are first-class.

**Tradeoff (accepted for hackathon):** Framework surface area is larger than a tiny Express server; the win is integration speed and fewer moving parts.

---

## 3. TypeScript

**Purpose:** One source of truth for shapes of **menu items** (including `kind: "food" | "drink"`), **order lines**, and **API payloads**.

**Why it suits this project**

- **PRD:** Staff filtering depends on every line knowing its **food/drink** classification — types catch mistakes at compile time ([PRD §5.1](./PRD.md)).
- **PRD:** Contract-first workflow ([PRD §11](./PRD.md)) — shared interfaces between `POST /orders` body and staff list rendering reduce integration bugs under time pressure.
- **Team:** Refactors (e.g. adding `status` or `available`) stay safer in the last hour of the hackathon.

**Tradeoff:** Slightly slower first file than plain JS; negligible compared to debugging silent shape mismatches.

---

## 4. Tailwind CSS

**Purpose:** Layout and visual hierarchy quickly for **two form factors**: mobile guest and laptop staff.

**Why it suits this project**

- **PRD:** Guest needs large tap targets, sticky cart, clear CTAs; staff needs dense tables/cards — utility classes speed iteration without context-switching to many CSS files ([PRD §3–4](./PRD.md)).
- **PRD:** “Polish last” ([PRD §11](./PRD.md)) — Tailwind keeps styling changes local to components.

**Alternative:** CSS Modules or a small component library — fine if the team is faster there; Tailwind is the default recommendation for speed.

---

## 5. MongoDB

**Purpose:** Durable storage for **menu** (seeded) and **orders** so restarts and multiple tabs do not lose demo data.

**Why it suits this project**

- **PRD:** Explicit requirement to **persist orders** for staff visibility — MongoDB is a straightforward **server-side** store; avoid “cart only in localStorage” ([PRD §5.1](./PRD.md), [PRD §9](./PRD.md)).
- **PRD:** Single-venue, single menu — model as simple **collections** (e.g. `menu_items`, `orders`) without multi-tenant complexity ([PRD §3](./PRD.md)).
- **Document fit:** One **order** document can embed a **`lines`** array (each line: menu reference id plus **snapshot** fields `name`, `price` (integer **pence**, UK), `kind`) so staff views stay stable without SQL joins ([PRD §5.1](./PRD.md), [PRD §9](./PRD.md)).
- **Hackathon ops:** Use **`MONGODB_URI`** in env — either **local `mongod` / Docker** (works on flaky Wi-Fi once running) or **MongoDB Atlas** (budget a few minutes for URI + IP allowlist if judges use LAN).

**Tradeoff:** Adds a **running database** (or cloud dependency for Atlas) versus a single SQLite file; team should script **seed** + optional **reset** so demos stay reproducible.

---

## 6. Data access: driver + validation (no Drizzle)

**Purpose:** Connect from Next **Route Handlers** with the official **`mongodb`** package; keep **Zod** (or shared TS types) aligned with API bodies and stored document shapes.

**Why it suits this project**

- **Orders:** `insertOne` / `find` on `orders` with embedded `lines`; index e.g. `createdAt` for staff queue ordering.
- **Menu:** Seed `menu_items` once (script or startup idempotent upsert); `GET /menu` reads from the collection.
- Fits a **3-hour** window: no relational migration pipeline; optional **Mongoose** only if the team moves faster with schemas than with driver + Zod.

**Alternative:** **Prisma** with the MongoDB connector — schema in one place; slightly more setup than the raw driver.

---

## 7. Short polling + manual refresh (no WebSockets first)

**Purpose:** Staff dashboard picks up **new orders** without building and debugging a persistent socket layer.

**Why it suits this project**

- **PRD:** Manual refresh is the minimum; short polling (e.g. 5–10s) is explicitly in scope ([PRD §5.1](./PRD.md)).
- **PRD pitfalls:** WebSockets are called out as easy to overrun in time ([PRD §9](./PRD.md)).
- **Implementation:** `useEffect` + `setInterval` calling `GET /api/orders` on the staff page, plus a **Refresh** button for instant feedback.

**Stretch:** Upgrade to SSE or WebSockets only if core flows are done early.

---

## 8. Staff access: environment secret + PIN or cookie

**Purpose:** Avoid a trivially guessable `/staff` URL being abused during demo ([PRD §7](./PRD.md)).

**Why this pattern**

- **PRD:** “Random path or PIN” — a server-checked **`STAFF_PIN`** (query param once, then **httpOnly cookie**, or a long random path segment) is enough for hackathon threat model.
- **Implementation:** `GET /api/orders` returns **401** without valid pin; staff page prompts once or reads from env in dev-only bypass (document clearly for judges).

**Not chosen for MVP:** Full OAuth / Clerk / Auth0 — time cost and unnecessary without user accounts ([PRD §2](./PRD.md)).

---

## 9. Same-origin API (Next Route Handlers)

**Purpose:** Guest phone hits the same host/port as the Next app so **menu and orders** do not require CORS preflight configuration.

**Why it suits this project**

- **PRD pitfalls:** CORS and LAN IP mistakes are called out as common failures ([PRD §9](./PRD.md)).
- **Flow:** Phone opens `http://<laptop-ip>:3000/menu?table=5`; `fetch("/api/orders")` stays same-origin.

**When you’d split:** Separate SPA + API only if the team strongly prefers it; then budget time for **CORS** and **env-based API base URL**.

---

## 10. What we are deliberately not using (for this MVP)

| Technology | Reason to skip (for 3 hours) |
|------------|------------------------------|
| **Payment SDKs** | Out of scope ([PRD §2](./PRD.md)). |
| **SQLite / file-backed SQL** | MongoDB is the chosen store; document model matches embedded order lines ([PRD §5.1](./PRD.md)). |
| **Redis / message queues** | No distributed workers or peak fan-out requirement for MVP. |
| **WebSockets / realtime DB first** | Higher debug risk before core demo works ([PRD §9](./PRD.md)). |
| **Mobile native apps** | PRD requires **no app download** ([PRD §2](./PRD.md)). |
| **Heavy auth platforms** | No user accounts in MVP ([PRD §2](./PRD.md)). |

---

## 11. Document history

| Version | Notes |
|---------|--------|
| 1.0 | Initial stack rationale tied to PRD v1.1. |
| 1.1 | Persistence switched from SQLite + optional Drizzle to MongoDB + `mongodb` driver and Zod. |
| 1.2 | Order line snapshots: `price` in integer pence (UK), aligned with contracts (replacing `priceCents`). |
