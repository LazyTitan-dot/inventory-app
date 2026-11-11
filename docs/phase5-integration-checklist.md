# Phase 5 integration checklist

The later full-application adaptation of the supplied
`smartliving_customer_addresses_tracking.html` is recorded in
[the current implementation and verification report](prototype-adaptation.md).
It implements the attachment's inventory, cashier, purchasing/receiving,
customer-address, tracking and dashboard workflows. The audit below preserves
the initial shared-shell checkpoint and is not the current feature-completion
record. Release authorization was subsequently expanded by the user to direct
production application; PR #1 remains unmerged.

Date: 11 November 2026. Repository: `LazyTitan-dot/inventory-app`.
Baseline: `origin/master` at `44e82d1dc6c83ab392814abc40fe7a173487457d`.
Working branch: `design/phase5-shell-v1`.

This audit compares the starter ZIP's `roadmap_phase5.md` (updated 10 November 2026) with the current React application. A checked item below means the capability is visible in the baseline source; it does **not** mean the original prototype has been integrated or that this audit performed a runtime test. Test outcomes belong in the separate shell verification report.

## Scope and source authority

The initial request authorized a local branch, a Phase 1–4 integration audit, and implementation/testing of the shared app shell, with a pause for review before publication. That pause was completed. On 11 November 2026 the user approved proceeding with committing the branch and opening a draft PR. Merging, production deployment and production Supabase operations remain outside this continuation.

The ZIP is implementation/reference material. Its README recommends a commit, draft PR and Vercel preview; the user's subsequent approval governs the continuation. Its historic GitHub integration 403 is not a prerequisite for creating a local Git branch. The roadmap's statements that prototypes passed tests describe those earlier standalone prototypes, not this React integration.

The first slice adds the shared shell and supplied design-system foundations locally. It does not migrate Inventory 2.0, Sales 2.0, Purchases & Deliveries 2.0, or customer-address features. Existing authentication, permission guards, transaction commands, data contracts, and business logic must remain intact. Use local fixtures or non-production test resources.

## Phase 1 — Inventory 2.0

Existing capabilities to preserve:

- [x] Product/variant catalog, text/SKU/barcode search, category and catalog/stock-status filters.
- [x] Active-product, available-unit and low-stock counts; role-bound inventory value and margin.
- [x] Variant SKU, minimum stock, replenishment target, available/quarantine stock and ITBIS breakdown.
- [x] Product editing, automatic editable SKU generation, archive/reactivate controls and image handling.
- [x] Movement history and counted-stock adjustments with a reason, through existing commands.

Remaining integration work:

- [ ] Obtain and compare the approved Inventory 2.0 / Inventory 2.2 original prototype.
- [ ] Reproduce the approved responsive catalog and user-controlled sorting; current catalog filtering has no sort control.
- [ ] Add the prototype stock-to-minimum visual indicator and reconcile the exact stock-health categories/counts with the variant model.
- [ ] Replace or adapt the existing detail modal into the approved contextual desktop drawer and mobile bottom sheet, preserving focus behavior.
- [ ] Verify the full detail presentation: SKU, category, status, suggested replenishment target and tax-inclusive/exclusive prices.
- [ ] Implement quick sale and replenishment actions that preselect the exact variant; existing catalog detail has no such actions.
- [ ] Verify negative-stock rejection, audit consistency, idempotent retries and concurrent variant changes with local contract tests.
- [ ] Verify cost visibility for every role, keyboard/focus behavior, large text and real devices.

Evidence: `src/pages/Catalog.tsx` (`StockEditor`, `CatalogPage`, detail `Modal`), `src/lib/sku.ts`, `src/lib/pricing.ts`, `src/components/ProductImagesEditor.tsx`.

## Phase 2 — Sales 2.0

Existing capabilities to preserve:

- [x] Cashier/catalog workspace with product search and exact SKU/barcode matching on Enter; hardware scanners can act as keyboard input.
- [x] Multi-product cart with add/remove/quantity controls and client-side available-stock caps.
- [x] Subtotal, pre-tax discount, ITBIS, total, recorded payment method, notes, cash received and change.
- [x] Customer selection, sale history and internal printable receipt containing item/payment/tax snapshots; receipt identifies itself as non-fiscal.
- [x] Existing sale command, stock updates, returns/partial refunds, controlled voiding, quotes and promotions.

Remaining integration work:

- [ ] Obtain and compare the approved Sales 2.0 original prototype.
- [ ] Integrate the approved dedicated cashier layout, desktop checkout panel and mobile cart sheet with persistent confirmation.
- [ ] Add camera scanning with cross-browser fallback; no `BarcodeDetector`/camera scanner exists in the current app.
- [ ] Resolve percent-discount UX against existing semantics: the current manual discount field is an RD$ amount; promotions also support percentage discounts. Preserve server-authorized limits and rounding.
- [ ] Verify insufficient cash, stock caps, missing prices, stale prices, customer/payment semantics and two simultaneous sales of the last unit.
- [ ] Verify snapshot stability, cents/ITBIS calculations, audit and idempotency through existing transactional commands.
- [ ] Verify cashier cost restrictions, returns/refunds and route permissions after feature adoption.
- [ ] Validate receipt paper sizes, actual printers, mobile scanners, screen readers and focus behavior.

The prototype simulates checkout; it supplies no authority for payment processing or fiscal NCF/e-CF issuance. These are not added by this integration.

Evidence: `src/pages/Commerce.tsx` (`CreateDocument`, barcode/SKU search handler, `DocumentDetail`), `src/pages/AfterSales.tsx`, `src/lib/pricing.ts`, `src/state/useOperation.ts`.

## Phase 3 — Purchases & Deliveries 2.0

### Purchases and receiving

Existing capabilities to preserve:

- [x] Supplier-based multi-line purchase orders, notes, quantities and unit costs.
- [x] Pending/partial/completed document states and document status filtering; pending quantity/cost indicators.
- [x] Manual partial receiving with positive/integer/outstanding-quantity validation and unlinked-item rejection.
- [x] Ordered/received quantities and preserved supplier/item snapshots.
- [x] Outstanding-quantity cancellation with a reason and retained history.
- [x] Replenishment suggestions subtract quantities on pending/partial purchase orders.

Remaining integration work:

- [ ] Obtain and compare `smartliving_phase3_purchases_deliveries.html`.
- [ ] Add expected purchase date and overdue views/alerts; the current document contract has no purchase expected-date field.
- [ ] Adopt the approved purchasing workspace, open/overdue/completed filters and pending summaries.
- [ ] Implement independently tracked conforming, damaged and outstanding receipt quantities; current items expose `received_quantity` only.
- [ ] Ensure damaged receipts never increase sellable stock; define and test the required server contract separately.
- [ ] Add one-unit barcode/SKU receiving, repeat-scan cooldown, manual fallback and cross-browser camera fallback.
- [ ] Test bulk-item and duplicate-scan semantics independently from command retry idempotency.
- [ ] Compare existing cancellation of pending quantities with explicit close-with-shortages confirmation and retained shortage documentation.
- [ ] Add receiving label printing and internal Code 128 generation where no barcode exists, with a reviewed identifier policy.
- [ ] Verify partial/excess receipts, supplier/order snapshots, tax treatment, audit and receipt-event idempotency.
- [ ] Validate cost visibility, screen readers, keyboard operation and physical scanner/label-printer behavior.

Evidence: `src/pages/Commerce.tsx` (`CommercePage`, `ReceivePurchase`, `ReverseDocument`), `src/lib/reports.ts` (`inventoryReport`), `src/lib/contracts.ts` (`documentSchema`, `documentItemSchema`).

### Deliveries and cross-module links

Existing capabilities to preserve:

- [x] Scheduled, in-transit, failed, delivered and cancelled states, plus status/date/search filters.
- [x] Scheduling and staff assignment, failed-attempt reason, rescheduling and recipient-name collection.
- [x] Delivery history, recorded timestamps and sale-to-delivery links.
- [x] Independent delivery address/phone/contact fields, initially derived from the sale snapshot.
- [x] Manual WhatsApp composer with recipient/text review; complete sale item list supplied to the delivery message builder.
- [x] Dashboard delivery-attention/overdue indicators.

Remaining integration work:

- [ ] Compare prototype pending/in-transit/overdue/incident/delivered views with the current status/date filters.
- [ ] Require the prototype's written delivery-receipt confirmation; current delivery completion requires a recipient but permits an empty observation.
- [ ] Present the entire multi-product sale in delivery detail; current delivery detail shows contact/schedule/history, while the WhatsApp builder already receives all sale items.
- [ ] Verify sale-receipt scheduling preserves all items and links back to the right sale/inventory context.
- [ ] Verify delivery completion does not deduct stock again and reconcile its operational event with the inventory movement-history experience.
- [ ] Compare cross-module purchase/sale/delivery timeline links and actionable purchase/delivery alerts.
- [ ] Verify permission-bound access, recipient evidence, audit, retries and historical delivery destinations.

Evidence: `src/pages/Operations.tsx` (`DeliveriesPage`, `DeliveryEditor`, `DeliveryDetail`, `DeliveryTransition`), `src/pages/Commerce.tsx` (`DocumentDetail`), `src/pages/Dashboard.tsx`, `src/lib/whatsapp.ts`.

### Customer addresses and basic operational tracking

- [x] Current contacts hold one address; deliveries store a separate address and recorded status/history.
- [ ] Obtain and compare `smartliving_customer_addresses_tracking.html`.
- [ ] Add multiple labeled saved customer delivery addresses and a preferred destination.
- [ ] Add a saved-address picker for new deliveries and preserve an independent delivery snapshot.
- [ ] Verify editing the customer profile cannot rewrite historical delivery destinations.
- [ ] Compare address search and manual messaging conveniences without presenting them as verified geolocation or proof of delivery.

Evidence: `src/pages/Contacts.tsx` (`ContactEditor`), `src/pages/Operations.tsx` (`DeliveryEditor`), `src/lib/contracts.ts` (`contactSchema`, `deliverySchema`).

## Phase 4 — Shared design system

Local shell slice under review:

- [ ] Review supplied semantic tokens, reusable CSS and typed React primitives in the real application.
- [ ] Review approved original brand assets and exact spelling **S-mart Living**.
- [ ] Review the persistent Cool Glass desktop sidebar, continuous 6px frame and quiet full-row active selection.
- [ ] Review solid/legible transaction surfaces and Spanish-first labels.
- [ ] Review the Quiet Glass mobile dock and More navigation, deriving visibility from existing permissions.
- [ ] Review theme preference storage, light/dark appearance, reduced-motion and reduced-transparency fallbacks.
- [ ] Verify widths 320, 390, 768, 1024 and 1440px, print behavior, keyboard/focus, menu closure, large text and accessible names.

Full adoption remains later work:

- [ ] Obtain the complete Phase 4 package and interactive reference listed below.
- [ ] Compare `tokens.json`, `tokens.css`, layout, typography, spacing, motion and semantic/focus colors against the originals.
- [ ] Reconcile existing shared UI with the supplied button/field/status/table/surface/navigation primitives; migrate feature screens in separately reviewable slices.
- [ ] Audit hardcoded legacy colors and page-specific CSS for theme inheritance and contrast.
- [ ] Complete design review/approval and apply the original six-stage release gate.
- [ ] Review `adoption-checklist.md` and `contrast-audit.json`; do not treat the prototype's 12 opaque color-pair results as full WCAG certification.
- [ ] Complete real glass-background, assistive-technology, modal/focus, physical-device and printer audits.
- [ ] Verify business commands and role-bound sensitive data after each adopted screen; do not copy prototype amounts or simulated actions into production.

Evidence: starter `overlay/src/design-system/*`, `overlay/public/brand/*`, `preview/shell_preview.html`; current `src/components/ui.tsx`, `src/styles.css` and page-specific CSS. The starter preview is a representative fixture, not the original feature prototypes or the real app.

## Original prototype files still needed

These artifacts are absent from both the checkout and the supplied starter archive:

| Original artifact | Needed contents / naming certainty |
| --- | --- |
| Approved Inventory 2.0 / Inventory 2.2 prototype export | Original self-contained HTML and any dependencies. The roadmap does **not** provide an exact filename. |
| Approved Sales 2.0 prototype export | Original self-contained HTML and any dependencies. The roadmap does **not** provide an exact filename. |
| `smartliving_phase3_purchases_deliveries.html` | Exact filename given by the roadmap. |
| `smartliving_customer_addresses_tracking.html` | Exact filename given by the roadmap; basic address/status reference, not authorization for Phase 6. |
| `S-mart_Living_Design_System_v1.zip` | Full original package, including `tokens.json`, `tokens.css`, `components.css`, `react/SuiPrimitives.tsx`, `showcase.html`, original brand assets, `README.md`, `adoption-checklist.md`, `contrast-audit.json` and the six-stage release gate. |
| `S-mart_Living_Design_System_v1_Interactive.html` | Original standalone interactive design-system preview. |

The starter already includes four approved brand image files, CSS/token/primitives overlays, the shell adapter, a patch script and patch tests. The complete originals are needed for fidelity comparison, not to repeat existing transaction functionality. The repository's `inventory-app.html` is legacy application source and is not evidence of these redesign prototypes.

## Cross-cutting acceptance gates

- [ ] Preserve authentication/recovery/logout and existing route guards.
- [ ] Preserve server-enforced permissions and suppression of costs/margins for unauthorized roles.
- [ ] Preserve immutable document/item/tax snapshots and accurate DOP rounding.
- [ ] Preserve `retail_command` transaction boundaries, audit consistency, concurrency checks and retry UUID semantics.
- [ ] Test stock adjustments, receiving, sales, returns/refunds and deliveries using local synthetic fixtures or non-production resources.
- [ ] Keep migrations/RPC/schema changes out of the shell slice; review any needed feature changes separately.
- [ ] Record test evidence and limitations before proposing any release action.

## Phase 6 — Deferred

Driver workspace, customer tracking links, photo/signature proof, optional notifications and live GPS/maps/ETA remain deferred. The roadmap explicitly says real-time tracking is not a prerequisite for Phases 4–5. No simulated vehicle, location sharing, production tracking link, provider integration or retention policy is implemented by this shell slice.
