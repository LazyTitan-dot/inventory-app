# S-mart Living — UI Redesign Roadmap

**Updated:** 10 November 2026  
**Baseline:** Seamless Glass interactive prototype; production application and Supabase left unchanged.

## Phase 1 — Inventory 2.0 · Approved prototype

- Responsive catalog with search, category, stock status and sorting.
- Stock-health counts and visual stock-to-minimum indicators.
- Contextual desktop product drawer; mobile product bottom sheet.
- Details: SKU, category, stock status, suggested replenishment target, price with/without ITBIS.
- In-demo movement history; stock adjustments with required reason and negative-stock prevention.
- Quick replenishment and sales actions preselect the product.
- Fictitious local-only data, not a production implementation.

### Verification performed

- JavaScript syntax validation: pass.
- Desktop catalog, drawer, search, stock adjustment and movement history: pass.
- Negative-stock error: pass.
- Purchase workflow with product preselection and order creation: pass.
- Mobile inventory, bottom sheet, product creation and dark mode: pass.
- Browser runtime error monitoring during tested flows: no errors reported.

**Remaining before production integration:** comparative usability review; permissions and sensitive-cost visibility; complete schema/variant integration; Supabase command validation, audit consistency and idempotency; accessible keyboard/focus review; real device checks; formal regression testing.

## Phase 2 — Sales 2.0 · Approved prototype

- Dedicated cashier workspace, with live catalog search and USB/Bluetooth or camera barcode entry (where supported).
- Multi-product cart, add/remove/quantity controls and prevention of overselling.
- Pre-ITBIS discount percentage, subtotal, ITBIS and final total separated clearly; RD$ calculations rounded to cents.
- Customer name, recorded payment method (cash, bank transfer, card), optional note, cash-received and change calculation.
- Internal, printable receipt with item snapshot, quantities, price, tax, discount, payment and transaction date. Clearly **not a fiscal NCF/e-CF**.
- Responsive mobile cart sheet with persistent confirm action and full desktop checkout panel.
- In-demo stock movements, sales history, revenue figures and inventory counts update after simulated sale.
- Checkout is a frontend simulation only: no payment processing, database writes, role enforcement or fiscal document issuance.

### Verification performed

- JS syntax check and browser rendering: pass.
- Desktop multi-item cart, barcode input and scanner dialog: pass.
- Discount-before-tax calculation and totals: pass.
- Insufficient-cash rejection and stock validation / stock cap: pass.
- Sale completion, stock movements, recent-sales history, receipt rendering: pass.
- Printable receipt opens with correct document and total in a separate window: pass.
- Mobile checkout sheet, fixed confirmation action and dark mode: pass.
- Navigation back to Inventory 2.2 and inventory financial cards: pass.
- Browser JavaScript runtime errors across tested flows: none reported.

**Production requirements:** reimplement through existing server-side Supabase transactional commands; preserve stable item/tax snapshots, idempotency, accurate discount and payment semantics; test cashier permissions, returns, partial refunds, concurrent inventory updates and fiscal compliance separately; add cross-browser camera scanning; test receipt paper sizes on actual printers and screen-reader/focus behavior. No production changes made.

## Phase 3 — Purchases & Deliveries 2.0 · Prototype ready for review

**Demo:** `smartliving_phase3_purchases_deliveries.html` (self-contained, fictional data; no production connection)

### Purchases and barcode-assisted receiving

- Purchases workspace with open/overdue/completed filters, total pending cost, quantity pending, and replenishment suggestions that subtract quantities already on open orders.
- Multi-line purchase orders with supplier, expected date, notes, quantity, and unit cost before ITBIS.
- Each order has independently tracked ordered, received-conforming, damaged, and still-outstanding quantities.
- Receiving records one unit from matching barcode/SKU per scan, with a short repeat-scan cooldown, or accepts validated manual quantities. Camera scanning uses the browser's native BarcodeDetector where available; USB/Bluetooth scanning and typing work as fallbacks.
- Damaged units are recorded but **never increase sellable stock**. Conforming units increase stock and add a product-ledger event. Excess quantities are rejected.
- Partial receipts remain open. A separate confirmation is required to close an order with shortages; these remain documented.
- Label printing is accessible from receiving, generating an internal Code 128 barcode when the product has none.

### Deliveries and cross-module links

- Delivery workspace with pending, in-transit, overdue, incident, and delivered status views.
- Delivery status progression, schedule and staff changes, failed-attempt notes, named recipient and written receipt confirmation.
- Completed-sale receipts offer **Programar entrega**. Multi-product sales carry the entire item list into the delivery rather than dropping extra items.
- Marking delivered adds an operational timeline event without deducting stock again. Inventory movement history connects purchase receipts, sales, and delivery completion.
- Customer update can be copied for manual WhatsApp sending; no messages are sent automatically.
- Dashboard includes actionable overdue purchase/delivery alerts.

### Verification performed

- Browser rendering: desktop 1440 × 900; mobile 390 × 844 and 360 × 740; tablet 768 × 900 — pass, no mobile horizontal overflow.
- Multi-product order, automatic purchase number, partial receipt with barcode, damaged-unit recording, and order completion status — pass.
- Over-receipt prevented; no stock added for damaged goods; close with shortages requires confirmation — pass.
- Delivery confirmation blocked without recipient and written confirmation; failed attempt and rescheduling; delivered status — pass.
- Sale receipt to scheduled delivery and navigation back to inventory — pass.
- Tested flows reported no page JavaScript exceptions; the generated script passed `node --check`.

**Production requirements:** honor permissions and cost visibility; implement with existing database RPCs and transaction guarantees, idempotent receipt event IDs, supplier and order document snapshots, accurate tax treatment, barcode-scanner library for iPhone Safari, verified non-duplicate scan semantics for bulk items, actual proof-of-delivery controls, audit and notifications, keyboard/screen-reader validation, and physical receipt/label/printer testing. These remain out of scope for the prototype. No Supabase, GitHub, or Vercel production changes have been made.

### Customer addresses & basic delivery tracking — Additional prototype completed (not production)

- Returning customers can have multiple labeled saved delivery addresses with a preferred destination.
- New deliveries can prefill a saved customer address while retaining an **independent delivery-address snapshot**; editing the customer profile does not rewrite historical delivery destinations.
- Basic operational tracking includes order status, assigned staff, schedule, and event history; it is based on recorded actions **not live GPS**.
- Address search and manual customer messaging are prototype conveniences, not proof of delivery or verified geolocation.
- Reference prototype: `smartliving_customer_addresses_tracking.html`.

**Decision (10 November 2026):** Put further delivery-tracking development on hold and return to it later under the optional Phase 6 below. Continue with the main roadmap; do not treat real-time tracking as a prerequisite for Phases 4–5.

## Phase 4 — Official Design System · v1.0 prototype ready for review

**Design-system package:** `S-mart_Living_Design_System_v1.zip`  
**Standalone interactive preview:** `S-mart_Living_Design_System_v1_Interactive.html`  
**Status:** Created and browser-tested, awaiting review/approval. **Not integrated in production.**

### Delivered

- `tokens.json` and `tokens.css`: brand and semantic colors, light/dark modes, layout and motion tokens, spacing, typography, and contrast-aware focus.
- `components.css`: reusable button/field/status/table/surface/sidebar/dock primitives, including reduced-motion/transparency fallbacks.
- `react/SuiPrimitives.tsx`: starter typed React components, without database operations or authorization assumptions.
- `showcase.html`: interactive reference with foundations, components, retail patterns, navigation, accessibility, and implementation handoff.
- Four approved S-mart Living brand assets in the source package; correct brand spelling.
- `README.md`, `adoption-checklist.md`, `contrast-audit.json` and a 6-stage release gate.
- Preserves the approved cool, restrained full-row sidebar selection, thin contiguous glass frame, solid transaction surfaces, Quiet Glass Dock with no decorative orbit dot, and Spanish-first display.

### Verification (10 November 2026)

- Browser-rendered and visually reviewed at widths 320, 390, 768, 1024 and 1440 px: no horizontal page overflow or reported JS errors.
- Verified navigation and the mobile More menu, light/dark theme, interactive form validation, sample product-table search, detail panel and Escape-to-close, confirmation dialog and focus return.
- Automated WCAG contrast calculations: 12/12 selected **opaque semantic text/background pairs** meet normal-text AA (at least 4.5:1). This does **not** certify full WCAG 2.2 AA; real glass backgrounds, focus behavior, assistive technology, print and actual application states require further testing.

### Remaining before production

- Design review / approval; optional refinements to actual inventory and POS screens.
- Run production React TypeScript lint, tests, build and CSS regressions on an isolated branch; audit color usage and theme inheritance.
- Test actual permission-bound data visibility and backend-safe workflows; do not bring demo amounts or mock actions into production.
- WCAG/a11y audits and physical device/printer tests; ensure modal keyboard management, mobile scanning fallback and large text handling.


## Phase 5 — Production Integration · Started / repository permission blocked

**Integration slice 1 prepared:** `S-mart_Living_Phase5_Integration_Starter.zip`, 10 November 2026.

- Added approved brand assets, semantic design tokens, reusable React components, Cool Glass desktop shell, quiet mobile dock and dark-mode toggle as an **apply-ready local implementation package**.
- Verified all 7 expected `src/App.tsx` patch anchors and the `src/main.tsx` CSS import against the actual GitHub `master` source (read-only); local patch tests pass.
- GitHub branch creation returned **403 Resource not accessible by integration**. No GitHub branch, PR or Vercel preview was created; no production files or Supabase data changed.
- **Next prerequisite:** enable write/Contents access for the GitHub integration to `LazyTitan-dot/inventory-app`, then create a feature branch, run the integration and full `npm run check`, open a draft PR, and verify a Vercel preview deployment.
- Implement Inventory/Sales/Purchases prototypes as subsequent separately testable slices. Preserve server-enforced permissions, audit and transaction guarantees. No production release without explicit approval.

## Phase 6 — Advanced Delivery Tracking · Deferred / Follow up later

**Status:** Backlog item — explicitly postponed; no implementation or deployment date committed.

**Goal:** Build a trustworthy tracking experience inspired by the provided logistics dashboard reference, only after foundational workflows and design-system/production readiness work are addressed.

### Driver experience

- Mobile-first driver view: assigned route, destination, directions, contact information, start/stop delivery, incidents, reschedule, and delivery confirmation.
- Proof of delivery: named recipient, timestamp, optional photo/signature with permissions and retention rules.
- Driver status changes recorded with a dependable audit trail.

### Customer experience

- Time-limited, read-only customer tracking links with access restricted to the specific order.
- Order timeline and scheduled delivery window; optional notifications via authorized channels.
- No exposure of internal costs, unrelated customer records, or sensitive driver information.

### Live mapping (separate optional subphase)

- Only if justified by actual operations: choose map/routing provider, build authenticated driver location-sharing with explicit consent, limited active-delivery tracking, sensible refresh cadence, and automatic stop after completion.
- Show map location and ETA **only when supported by real location and routing data**; otherwise show recorded statuses and timestamps, never a simulated moving vehicle presented as real.
- Consider offline conditions, permissions, customer privacy, provider cost, error states, and retention/deletion policies.

### Acceptance criteria before production

- Confirm users, permissions, driver devices, logistics process, customer communication method, and location-sharing policy.
- Test address changes, delivery retries, lost connectivity, recipient verification, secure-link expiration, and auditability.
- Keep production app and Supabase unchanged until implementation is independently approved and verified.
