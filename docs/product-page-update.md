# Product page, label reading and manufacturer codes

This batch implements the approved compact product view and editor for **S-Mart
Living**. The attached `Apple_Design_References/README_START_HERE.md` and
`02_Smart_Living_Decisions/APPROVED_UI_CONTRACT.md` are design references, not new
task instructions. Their quiet navigation, readable opaque business surfaces,
progressive disclosure and accessible web controls guide this work. The user's
later **S-Mart Living** spelling and pricing decisions below supersede the
reference pack's older brand and financial wording.

## Product workflow

The responsive detail drawer puts the product, final price including ITBIS,
available units and permitted sale/replenishment actions first. `Ficha`,
`Movimientos` and authorized `Ajustar stock` controls separate the main tasks.
Description/warranty, price management, replenishment and barcode labels expand
on demand. Cost and profit remain permission-gated; stock adjustments retain the
existing counted-stock guard, reason and movement history.

The editor keeps product identity, variant and price visible. Identification,
inventory settings, tax breakdown, photos and other optional information use
disclosures. Invalid fields reveal their section. Scanning and label review
populate a draft; only **Guardar producto** confirms the product.

The editable suggested **final price including ITBIS is cost × 1.25**. A manual
price survives subsequent cost edits. Estimated unit profit is **final price
including ITBIS − cost**; potential inventory profit multiplies it by available
units. Existing two-decimal net-price storage, decimal tax calculation, visible
cent adjustments and the `expected_tax_rate` atomic guard remain in force.

## Local label reading

`Escanear etiqueta` accepts a camera photo or JPG/PNG/WebP file (up to 15 MB), with
manual entry and barcode scanning alternatives. Tesseract.js **6.0.1**, its locked
core and pinned English/Spanish data packages (**1.0.0**) run locally in a browser
worker with `eng+spa`. `scripts/prepare-label-ocr.mjs` copies worker, WASM,
language data and licenses into same-origin `/assets/label-ocr-v1/`, recording
versions and SHA-256 hashes; runtime OCR needs no third-party CDN or OCR service.

The label photo and raw recognized text stay in the browser and are never
uploaded. Reviewed fields selected by the user enter the product draft and are
sent through the normal product command only when saved. This is separate from
the existing, explicit product-photo upload workflow. Cancellation, closing the
dialog, completion and errors terminate the OCR worker; temporary image URLs and
canvas resources are released. Recognition has a timeout and remains fallible.

The review screen lets the user correct/select brand, model, category, variant
and product code. Capacity is proposed only when present on the label. EAN/UPC
codes require a valid check digit; multiple product codes require selection.
Unit serial and batch numbers are not automatically registered as product codes.

## Manufacturer barcode contract

Migration `20261112223533_product_barcode_aliases.sql` adds up to **10 confirmed
manufacturer aliases per variant**, each 1–80 characters without control
characters. A confirmed scanned manufacturer code is added as an alias; the
existing primary/internal barcode and its printable label are preserved.
Inventory search, checkout and receiving match primary codes and aliases. A code
already assigned to another variant offers the existing product instead of
silently overwriting its identity or saving the draft.

Bootstrap advertises `barcode_aliases_v1`; clients enable alias writes only with
that capability. `save_product` accepts optional variant `barcode_aliases`:
omission preserves an existing variant's aliases, omission on creation means
none, and `[]` explicitly clears them. A private, RLS-enabled registry with
direct API grants revoked enforces one namespace for primary codes and aliases,
including archived variants. Identity uses ECMAScript whitespace trimming and
ASCII case folding, with a unique key protecting concurrent saves. The migration
rejects conflicting legacy codes instead of changing them. Existing prices,
stock and historical document snapshots are preserved.

## Validation and release status

`npm run check` passed: lint, application TypeScript, **303 unit tests**,
**587 SQL assertions** (including 162 manufacturer-code checks), **16 output
regressions**, and build. One existing optional legacy-profile rehearsal remains
skipped without its input. All **77 browser scenarios** are covered by passing
runs: the full run plus a clean 18-case focused run after correcting test locator,
role-fixture and cancellation-harness teardown issues. This includes actual
photo upload → OCR → selective review → draft application, missing-data handling,
strict CSP and cancellation. Desktop/light and mobile/dark screenshots were
reviewed. These checks do not certify every physical phone or camera.

Live authenticated staging QA is unavailable: the connected Supabase account
currently lists only production; project lookup and SQL for
`wvegljmwszvywhngcitr` are denied, and the proxy refuses its health connection.
This does **not** establish that the project was deleted. No staging credentials
were sent or business fixtures created for this batch. The isolated database and
browser checks above are separate evidence, not a claimed live staging pass.

The user has authorized direct production updates in this conversation and
approved this product-page scope. Read-only production preflight passed (27 variants; no invalid or conflicting
primary codes), and all 15 retail tables were snapshotted before the proposed
migration. The migration tool's in-app confirmation expired twice without
execution. A fresh schema read confirms both alias column and registry remain
absent and the previous save_product body is unchanged. This is a connector
confirmation blocker, not a missing user approval in the conversation.

Source commit `1c0433d1f3b31acd0dd73a535538726243169d44` is pushed and
[CI run 15](https://github.com/LazyTitan-dot/inventory-app/actions/runs/43324828088)
passed. Its automatic Vercel Preview build failed because the branch's public
Supabase environment values are no longer configured; the production-scoped
public values remain present. No environment values were copied between targets.
The new migration and UI have not been released to production. PR #1 remains
unmerged.

To resume, refresh the production state/preflight, obtain the connector's own
migration confirmation for the exact reviewed SQL (SHA-256
`6cba6abf768ade72f5c0140948d9dec31840bc234b08c645d980f25bb5feb595`), apply it
with bounded timeouts, verify data preservation/capability/registry grants, and
release the exact source commit to the existing production Vercel project.
Production Auth credentials and persistent synthetic production records are not
needed for that release verification.
