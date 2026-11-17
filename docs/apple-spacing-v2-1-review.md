# S-mart Living — Apple-informed Spacing V2.1 (iPhone)

Status: implementation in isolated feature branch; no database migrations. Windows remains **pending acceptance**.

## References and interpretation

- [Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout): consistent grouping, aligned content, platform-safe layout, adaptable screen sizes.
- [Apple HIG — Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons): sufficient distance around controls and a **minimum 44×44 pt hit region** (not a blanket 44 px CSS mandate).
- [Apple HIG — Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables): grouped list sections with recognizable vertical space, aligned row content, readable control density.
- Project's **Design Standards — Inventory Manager** (independent internal reference): proposed spacing scale 4/8/12/16/24/32 px; clarity and accessibility over novelty.
- User-provided references: Apple Watch passcode keypad and iOS Settings grouped lists; use **spacing and alignment**, never copy Apple colors, symbols, licensing-restricted assets or native system chrome.

**Apple does not mandate an iPhone-specific global gutter of 20 px.** S-mart Living chooses 20–24 CSS px for screen/card gutters with safe-area-aware alternatives, typically 12–16 px inside controls, 12–24 px between groups and >=44 px control hit regions. Values are product design decisions, not official Apple measurements.

## Observed issues and changes

1. **Inventory Catálogo**: title and tax caption were nearly touching rounded card edges; filters filled the width. Apply aligned 20 px internal gutters, stack title/tax metadata on small screens, 12 px between filters, >=52 px filter hit targets, maintain search at top.
2. **Product detail**: disclosures touch one another, summary caret/text too close to the boundary, uneven footer action widths. Use 14 px between disclosure cards, >=20 px content insets, 62 px disclosure rows, separate footer actions with 52 px minimum height.
3. **Sales catalog**: card controls and product rows are dense. Give 20 px insets and 12 px between touch surfaces, retain all search/filter/scanner behaviors.
4. **Checkout/carrito**: long forms and payment sections need hierarchy. Inset mobile content and fields, separate discount controls and item rows, keep totals values and structure as approved.
5. **Payment**: preserve selected payment tile glass navy/cyan. Increase tile inner spacing to 16 px, 12 px between tiles and minimum height to 76 px; use one column for narrow 320 px layouts.
6. **Checkout bottom actions**: previous Glass V2 sticky footer could overlap options when scrolling. Restore natural document flow for action footer with distinct spacing and full-width accessible buttons.
7. **Print & PDF**: screen-only CSS, no print changes; barcode/OCR/serial logic and stock movements untouched.

## Release checklist

- [ ] CI lint/types/unit/PGlite/build green
- [ ] Playwright mobile widths: 320 / 375 / 390 / 430 px, light and dark
- [ ] Layout metrics: catalog title & tabs do not touch panel boundaries
- [ ] Accordion groups visibly separate; 44+ px touch controls
- [ ] Payment tile padding, safe button spacing, checkout footer does not overlay payment content
- [ ] Order controls, discounts, payment change, scanner and serial regression green
- [ ] Printed receipt unchanged, CSS isolated to screen mobile
- [ ] Owner's physical iPhone acceptance of observed issue areas
- [ ] Windows acceptance remains pending, not automatically approved
