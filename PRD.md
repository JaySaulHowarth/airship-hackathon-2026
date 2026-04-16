# Product Requirements Document: Table Order (Hackathon)

**Product name (working):** Table Order  
**Timebox:** ~3 hours  
**Constraint:** Web on phone (no app store), **no real payments**  
**Primary outcome:** Guests order from menu with table number (from QR); staff on laptop see a combined queue of orders with **food / drink** filtering.

---

## 1. Problem & vision

**Problem:** Guests wait to flag staff; staff lose orders in noise; peak times are chaotic.

**Vision:** Guest scans a QR that encodes their table, browses menu, builds a cart, submits **one order** tied to that **table**. Staff have a laptop dashboard of **incoming orders** in a **single queue**, with filters to focus on **food** or **drink** line items without separate kitchen/bar apps.

---

## 2. Goals and non-goals

### Goals

- Zero install: responsive web UI (guest on **phone**, staff on **laptop**).
- Fast path: menu → cart → submit; table comes from **QR-encoded URL**.
- Staff visibility: new orders appear without relying only on manual refresh (manual refresh minimum; short polling if time allows).
- Clear order payload: items (with food/drink classification), quantities, table, timestamp, status (minimal for MVP; stretch for statuses).
- **Single venue, single menu** — no zones, no multi-location.

### Non-goals (explicit)

- Payments, tabs, splitting checks, tipping.
- Accounts, loyalty, marketing, reservations.
- Inventory management, supplier integrations, analytics beyond demo.
- Separate kitchen vs bar **screens** or queues — use **one queue** + **filters** instead.
- Accessibility polish beyond “readable on a phone” (note as risk).

---

## 3. Locked product decisions

| Topic | Decision |
|--------|-----------|
| Table identification | **QR-encoded URL** includes table (e.g. `?table=12` or path `/t/12`). Guest sees table as read-only from URL; optional rare fallback “enter table” only if QR is broken for demo. |
| Menu scope | **One location, one global menu** — `GET /menu` (or equivalent) returns the full menu; no per-zone menus. |
| Devices | **Guest: mobile phone.** **Staff: laptop** — staff UI can be denser (tables, list + detail); guest UI mobile-first with large tap targets. |
| Staff workflow | **No split-screen apps.** One combined order stream; staff **filter views** by item type: **All / Food / Drinks** over the same orders. |

---

## 4. Users & needs

### 4.1 Guest (at a table, phone)

| Need | MVP behavior |
|------|----------------|
| Discover menu quickly | Categories or single scroll; search optional. |
| Understand item & price | Name, description (short), price. |
| Build order confidently | Cart with qty +/- ; obvious total. |
| Identify table | **Pre-filled from QR**; read-only in UI. |
| Submit without friction | One primary CTA; confirmation screen. |
| Trust order was received | Order ID + “sent to bar” message. |

### 4.2 Staff (bar / kitchen, laptop)

| Need | MVP behavior |
|------|----------------|
| See new orders | List sorted by time; new orders visually distinct. |
| Understand what to make | Line items with qty; **table number prominent**. |
| Focus on food vs drinks | **Filters:** All, Food-only, Drinks-only (see §5.3). |
| Reduce mistakes | Readable typography; clear table and item type. |

**Stretch:** Mark orders **in progress** / **complete**; mark menu items **unavailable** (guest UI disables or labels “sold out”).

---

## 5. Functional requirements

### 5.1 MVP (must ship)

**Menu**

- List of items: name, price, optional description, optional category for UX.
- **Required for staff filtering:** each item has a stable classification, e.g. `kind: "food" \| "drink"` (or equivalent). **Combos** (e.g. burger + beer): model as **separate line items** in one order rather than one item with two kinds — simplest for filters.
- Item detail optional; tap-to-add is enough.

**Cart**

- Add/remove, change quantity, running subtotal.
- Block submit if cart is empty.

**Order submission**

- Table taken from **URL/query** (shown read-only); **server persists the table value** sent with the order payload so staff see what the guest saw.
- Validate table if venue uses a fixed scheme (e.g. numeric tables `1..N`).
- Persist order **server-side** (or shared backend) so staff can read it.
- Response: success + **order id** (echo items, table, timestamp).

**Staff view (laptop)**

- **One queue:** all orders in chronological order (server timestamp for sort).
- **Filters (view only, same underlying orders):**
  - **Recommended MVP behavior (Option A):** Filter shows orders that **contain at least one** matching line item; the card **lists matching lines** first with a small “+N other items” (or similar) to expand full order.
  - Alternative (Option B): Full order always visible; non-matching lines **dimmed** when a filter is active — document if chosen.
- Minimum refresh: **Refresh** button; add **short polling** (e.g. every 5–10s) if time allows.

**Data seeding**

- Hardcoded seed menu or JSON file for speed.

### 5.2 Stretch (if time remains)

**Order statuses**

- States: `new` → `in_progress` → `completed` (define allowed transitions).
- Staff UI: buttons per order; guest does not need status for MVP.

**Availability**

- Per-item `available: boolean`.
- Guest: unavailable items disabled + “sold out”.
- Staff: simple toggle (menu manager or inline).

### 5.3 Staff filter behavior (reference)

- **Option A (recommended):** Filter shows orders with ≥1 matching line; card emphasizes matching lines; “+N other items” for the rest.
- **Option B:** Full order always shown; non-matching lines dimmed under filter.

---

## 6. User journeys

**Guest**

1. Scan QR → land on menu with `table` in URL.
2. Add items → review cart → submit (table already set).
3. Confirmation with order id / short reference.

**Staff**

1. Open staff URL (light protection — see §8).
2. See combined order list; use **All / Food / Drinks** to focus line items.
3. (Stretch) Change order status; (Stretch) toggle item availability.

---

## 7. Non-functional requirements (hackathon-realistic)

- **Performance:** First paint reasonable on mid-tier phone on event Wi-Fi (optimize or skip heavy images).
- **Reliability:** If submit fails (network), show error and **retain cart**; avoid silent wipe.
- **Security (proportionate):** Demo threat model; avoid guessable `/staff` without **random path**, **PIN**, or shared secret.
- **Operability:** One command to run app + API; README documents **LAN URL** / QR base URL for phone testing.

---

## 8. Edge cases & product rules

| Scenario | Rule |
|----------|------|
| Wrong table scanned | Physical QR per table; staff may catch odd tables; optional bold table on confirmation. |
| Guest edits `?table=` in URL | Server stores submitted table; validate allowed range if applicable. |
| Duplicate submit (double tap) | Disable submit while in flight; optional idempotency key. |
| Same table, multiple orders | Allowed; multiple rows in queue; optional “group by table” later. |
| Special requests / allergies | Optional note field; max length; no medical guarantees copy. |
| Price changes mid-session | Lock at **add-to-cart** or **submit** — pick one and implement once. |
| Item unavailable mid-session | On submit: reject with message or auto-strip line — define one. |
| **Food-only filter, order has only drinks** | With Option A: order **hidden** in Food filter (or show collapsed “no food items” — pick one). |
| Item tagged both food and drink | If ever needed: use `tags: ["food","drink"]` and define “appears in both filters.” |
| Staff concurrent updates | Last-write-wins acceptable for hackathon; document. |
| Spam / trolling | Rate limit by IP if easy; else accepted demo risk. |
| QR missing / broken | Rare manual table entry fallback for demo only. |

---

## 9. Technical pitfalls (3-hour build)

- **Realtime overkill:** WebSockets are slick but slow to debug; **short polling** often wins.
- **Split state:** Cart only in `localStorage` without server order — staff never sees it; **persist orders centrally** early.
- **CORS / URLs:** Define API base URL for **phone hitting laptop on LAN**; document IP + port.
- **Staff route exposure:** Public `/staff` gets trolled — use **random path or PIN**.
- **Data model creep:** Start with orders + lines referencing `menu_item_id`; avoid sizes/modifiers unless essential.
- **Double submit + polling:** UI disable + stable sort by server `created_at`.
- **Deployment:** Free-tier cold starts can fail demos; **local + tunnel** (e.g. ngrok) can be more reliable than fragile cloud in 3 hours.

---

## 10. Acceptance criteria (demo-ready)

1. Guest completes an order on a **phone**; sees confirmation with id.  
2. **Staff laptop** shows that order within **≤10 seconds** without redeploying.  
3. Table number matches QR/table in URL on staff view.  
4. **Food / Drink** filters change which line items (or orders) are emphasized per §5.3 Option A or B.  
5. Cart behavior on failed submit documented: **retain cart** preferred.  
6. (Stretch) Status and availability behave as specified.

---

## 11. Execution slice (suggested order)

1. **Contract first:** JSON for menu item (including `kind`), order create, order list.  
2. **Staff list + filters first:** proves pipeline; then guest submit.  
3. **Polish last:** styling, animations, fancy QR collateral.

---

## 12. Open sub-questions (optional, ≤2 minutes)

1. If an item could be **both** food and drink: use **tags** and define filter behavior (appear in both).  
2. **Empty filter result:** Hide order vs collapsed “no matching items” — align with Option A/B in §5.3.

---

## 13. Document history

| Version | Notes |
|---------|--------|
| 1.0 | Initial hackathon PRD. |
| 1.1 | Incorporated: QR table, single menu, staff laptop / guest phone, combined queue with food/drink filters, filter UX recommendation, edge cases and pitfalls consolidated. |
