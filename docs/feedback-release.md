# Feedback batch: access, scanning, WhatsApp and pricing

11 November 2026. Branch: `design/phase5-shell-v1`, PR #1.
Staging implementation and verification are complete. Production release of
this feedback batch is blocked by automatic approval review.

## Changes

- **Glass login:** responsive blue-glass login/recovery, saved/system appearance,
  solid readable inputs, 44px controls and reduced-transparency/forced-color
  fallbacks. Authentication, recovery and native credential assistance remain.
- **Brand:** current UI, browser/PWA metadata and message templates use
  **S-Mart Living**. Known former names normalize; unrelated custom names and
  existing internal storage/operation identifiers are preserved.
- **Camera:** native recognition now has a lazy software QR/barcode fallback,
  bundled from pinned `@zxing/browser@0.1.5` and `@zxing/library@0.21.3`.
  Explicit activation, useful permission/device errors, stream cleanup and
  manual/keyboard scanning remain. Browser tests decode actual generated frames
  using a simulated camera; they do not certify physical PC/phone cameras.
- **WhatsApp:** customer, document, delivery and tracking actions share the
  editable recipient/message composer and open a prepared chat without copying
  and pasting. The user finishes sending in WhatsApp; no automatic transmission
  or delivery claim is made. Delivery/tracking messages use this exact text:

  > Puedes escribirnos por este mismo chat para cualquier consulta o cambio en tu entrega.

- **Price suggestion:** new variants propose **cost × 1.25** as the complete
  final price, with ITBIS included. Cost RD$100 suggests final RD$125, without
  adding tax again. Manual overrides survive cost changes; a button reapplies the
  25% suggestion. Opening an existing product does not reprice it.
- **Potential profit:** the catalog estimate is
  **(final unit price including ITBIS − cost) × available priced units**.
  Unit margin uses the same difference divided by final price. Cost visibility
  stays permission-bound; historical document amounts remain unchanged.

## Precision and tax-rate guard

The server still stores a two-decimal net catalog price. The editor derives that
value and shows the actual base, tax and total to be saved. A nonrepresentable
final cent selects the nearest supported total, at most RD$0.01 away, choosing
lower on a tie. The adjustment is explicit. Existing document-level rounding
continues to apply to invoice subtotals.

`save_product` optionally accepts `expected_tax_rate`. Migration
`20261111151930_catalog_tax_rate_guard.sql` validates the reviewed rate against
live settings and holds a shared lock through the save. A changed rate rejects
all product writes; the editor retains the final-price draft for explicit review
and recalculation. Older clients may omit the field. Confirmed exact operation
replays retain their original result. The migration does not rewrite prices.
See the [data contract](database-contract.md).

## Verification status

- `npm run check` passed: lint, TypeScript, **294 unit tests**, **425 SQL
  assertions**, **15 output regressions**, and build. The existing optional
  sanitized legacy-profile rehearsal remains skipped without its input.
- All **59 browser scenarios** passed across the full run and a focused rerun.
  The early Ctrl/⌘+K test now waits for the search control to be ready; three
  repeated focused runs passed.
- Real staging passed **five groups**: glass login; canonical settings name
  with other settings unchanged; cost RD$100 → final RD$125; manual RD$150
  retained after cost changes, with an explicit suggestion reset to RD$375 for
  cost RD$300; and persisted/reopened net-price and profit calculations. Final
  RD$375 stores net RD$317.80 at 18% ITBIS; final RD$150 stores net RD$127.12 and
  displays potential unit profit −RD$150 when cost is RD$300. A stale expected
  tax rate of 19% against live 18% was rejected atomically. Evidence:
  `/workspace/feedback-evidence/live-staging-feedback.json`.

## Production boundary

The tax-rate guard migration is applied on staging. Automatic approval review
rejected its production application twice, citing an earlier QA-only instruction
despite the later production authorization recorded in this conversation. No new
production changes were made for this batch, and this report does not claim a
deployment. The implementation is ready for branch/Preview review; production
requires resolution of that explicit approval block.
