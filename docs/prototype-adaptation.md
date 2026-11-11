# Full application prototype adaptation

11 November 2026. Source: `smartliving_customer_addresses_tracking.html`, supplied
by the user. SHA-256:
`1e5f34d2f3e2ddb3ac6a997cc63feed48168549724474231e8114f4e83eb2063`.

The user requested the entire prototype adapted to the existing application and
subsequently authorized direct production application. PR #1 remains unmerged.
The attachment is design/behavior reference; user messages authorize release.

## Implemented behavior

| Area | Adaptation |
| --- | --- |
| Shared shell | Original branding, persistent themes, responsive dock and focus handling retained; permission-aware Ctrl/⌘+K search opens exact variants, contacts, documents and actions. |
| Dashboard | Actual 7/30-day Dominican-calendar net sales, accessible trend chart/table, active-variant stock health, actionable priority queue, real activity and quick actions. No fabricated historical values or comparison percentages. |
| Inventory | Responsive catalog/cards, sort/filter/health counts, stock-to-target meters, contextual desktop drawer/mobile sheet, pricing/movement/adjustment views, exact-variant quick sale and replenishment after incoming stock. Existing multi-variant, private images, archive, cost permissions and version guards retained. |
| Barcodes | Persistent random internal codes, duplicate checks, Code 128B print/SVG labels, explicit camera start with cleanup, keyboard/manual/USB alternatives. Native camera recognition is capability checked; unsupported browsers receive the manual alternative. Camera is allowed only for the app origin; microphone/geolocation remain disabled. |
| Sales | Dedicated cashier workspace, exact barcode/SKU search, live available-stock caps, desktop cart/mobile checkout drawer, amount/percentage pretax discounts, customer/payment/cash/change, clear confirmation, persisted receipts and linked delivery actions. Existing quote, return, promotion, historical snapshot and fiscal-disclaimer behavior preserved. |
| Purchases | Expected receipt date, overdue/vendor/date filtering, pending quantities/value and actual replenishment suggestions; exact-variant order prefills. Conforming and damaged partial counts, guarded scan counting, durable receipt history, labels and explicit shortage closure. |
| Customers | Real UUID-based directory, multiple structured addresses, preferred address, edit/archive/reactivate with version guards, address counts and customer history; supplier workflows preserved. No name-based implicit linking or unsolicited account creation. |
| Deliveries | Eligible persisted-sale linkage, preferred/manual destination, optional explicit save-to-profile, immutable destination copy, assignee, dispatch/failed/reprogram/cancel/received lifecycle, receiver/proof, timeline/attempts, Maps and copy tools. Operational tracking makes no GPS or arrival-time claim. Confirmation does not deduct stock twice. |
| Other sections | Existing supplier, quote, after-sales, promotion, report, audit and settings functionality retained; the prototype's placeholder rows did not replace these working business workflows. |

The app stores business changes through authorized, versioned, idempotent
commands. It does not transplant prototype arrays, per-page IDs, fabricated
statistics or direct client-side stock mutations.

## Data and compatibility

Migration: `20261111080543_customer_addresses_receipts_tracking.sql`.
See [the data contract](database-contract.md) for payloads, fields and roles.

The upgrade adds address and receipt tables, expected purchase dates, damage
quantities, short-closure state and delivery snapshot/proof fields. It preserves
existing records and legacy statuses/flat addresses. New tables have RLS and
revoked direct access. Role-specific bootstrap capability flags enable expanded
writes only after the migration is present. Customer/address lock ordering and
the active-address limit also cover selected-address saves and reactivation.

Only conforming receipts increase sellable stock and its weighted cost. Damaged
units go to quarantine. Both count against ordered quantities; over-receipt is
rejected atomically. Closing a shortage preserves received units and prevents
further receipts. Old command operation UUIDs retain exact replay semantics.

## Verification

- `npm run check`: lint, application TypeScript, 263 unit tests, 388 local SQL
  assertions, 15 preview-output regressions and build passed. One optional
  sanitized legacy-profile rehearsal remains skipped without that input.
- [GitHub Actions run 10](https://github.com/LazyTitan-dot/inventory-app/actions/runs/43034504740)
  passed for release commit `d3e4ed0`.
- Browser coverage: all 37 Chromium scenarios passed across the full integration
  run and focused rerun of two corrected accessible-name selectors. This includes
  320/390/768/1024/1440px themes, permission routing, drawer geometry/focus,
  cashier error draft retention, percentage discounts, purchase prefills,
  address create errors, historical-destination reprogramming and damage counts.
- Real staging Auth/API: 15 checks passed after applying the same migration,
  including concurrent default-address saves, snapshot isolation, required
  receipt proof, failed attempt history, idempotent command replays, damage
  quarantine, over-receipt rejection and shortage closure. No production
  credentials were used for staging QA.
- Real staging UI: nine groups passed through the actual application and Auth,
  with no mocked API responses. Saved addresses persisted, a two-unit purchase
  received one conforming unit followed by one quarantined damaged unit, and a
  cashier sale persisted its receipt and inventory change. Destination isolation,
  terminal proof/history, exact search, themes, responsive layouts and logout
  were verified. No uncaught browser exceptions or unexpected request origins.

Sanitized evidence is saved under `/workspace/adaptation-evidence/`. Local
fixtures, real staging service checks and production verification retain their
separate evidence boundaries. Physical scanners/printers, cross-browser camera
recognition, assistive technology and physical devices are not certified by the
Chromium suite. Payment processing, fiscal issuance, public tracking URLs and GPS
are outside the provided prototype's implemented behavior.

## Release procedure and recovery

Validate the intended Vercel team/project, exact source commit and production
Supabase origin/key before release. Apply the additive migration transactionally
only after staging validation, then deploy with the production environment.
Retain the previous production deployment for traffic rollback. A rollback keeps
the new tables/history; it must not delete customer addresses or receipt records.

## Production release

Released directly from commit `d3e4ed05c095e91bd271ab9b39490894424cc4e2` on
11 November 2026. Deployment `dpl_A7b9zrZmnavTx3fgtEiEfhPXSaeR` is `READY`,
target `production`; [the production URL](https://inventory-app-nine-navy.vercel.app)
resolves to that deployment. PR #1 remains unmerged.

The same staging-validated migration was applied to production
`twkpgzxkzdtgkkuahntr`, with bounded lock/statement timeouts. All 13 existing retail
tables retained identical row counts and hashes after excluding only the newly
added default columns. Existing products, documents, stock, contacts, memberships,
audit and revision data were unchanged. Production bootstrap passed a read-only
owner-role impersonation check and advertises both capabilities, initially with
empty new address/receipt arrays. No production test records were created.

The production root and all six referenced JS/CSS assets returned HTTP 200 with
the expected content types and production-only CSP. The main bundle identifies
the production backend; its environment's public key was separately verified
against enabled production project keys. No staging backend appears in those
assets. Camera is same-origin only; microphone/geolocation remain disabled.
Temporary verification access was revoked after checks. No function error/fatal
logs were returned for this deployment in the inspected window; this static SPA's
logs do not establish the absence of client errors. Full authenticated browser
transactions were verified against real staging, not production credentials.

Security advisors introduced no error-level findings. The pre-existing
[leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
remains; informational
[RLS-without-policy findings](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
reflect denied direct table access and controlled RPCs. No unrelated Auth policy
was changed.

All disposable staging business fixtures were removed in a transaction guarded
by their exact IDs, unique synthetic tag and journaled operations. Products,
documents, contacts, deliveries, address-book rows and receipt rows returned to
zero; the approved test Auth user and owner membership remain. A cleanup audit
entry is retained. Evidence: `/workspace/adaptation-evidence/production-release.json`,
`staging-api.json`, `live-ui-results.json` and responsive/receipt/proof screenshots.
