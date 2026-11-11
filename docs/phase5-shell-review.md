# Phase 5 shell review

11 November 2026. Local branch: `design/phase5-shell-v1`, created from freshly fetched
`origin/master` at `44e82d1dc6c83ab392814abc40fe7a173487457d`.

The user-authorized slice is the shared app shell and an integration audit.
The starter ZIP's proposed PR and Vercel preview are reference instructions for
a later stage. This work stops locally for review, before push, merge,
deployment, or any production Supabase operation.

## Shell diff

| Files | Change |
| --- | --- |
| `src/App.tsx` | Approved primary/business logos, exact S-mart Living footer, shell-scoped light/dark preference and appearance toggle, permission-bound mobile dock, modal mobile-navigation semantics and inert background. |
| `src/design-system/useMobileSidebar.ts` | Move focus into mobile navigation, trap Tab/Shift+Tab, close on Escape, restore trigger focus, lock background scrolling and clear the modal on desktop resize. |
| `src/main.tsx` | Import tokens, reusable primitives CSS and the shell adapter after the existing stylesheet. |
| `src/design-system/tokens.css`, `components.css`, `SuiPrimitives.tsx` | Supplied Phase 4 foundations. Feature forms still use the existing shared components; wholesale primitive adoption is a later slice. |
| `src/design-system/app-theme.css` | Persistent Cool Glass sidebar and 6px desktop frame, full-row active state, solid work surfaces, mobile Quiet Glass Dock and safe-area spacing. Bridge existing controls/dialogs/text/status surfaces to semantic colors; preserve dashboard highlight contrast; keep notifications above the dock; reset print to light tokens and remove shell padding/chrome. Includes reduced-motion/transparency and forced-color fallbacks. |
| `public/brand/*.png` | All four original supplied assets, byte-identical to the ZIP. Primary and square assets are used by the shell; alternate and badge are retained for later adoption. |
| `playwright.config.ts`, `tests/shell/*`, package manifests, `.gitignore` | Pinned Playwright development dependency, `npm run test:shell`, actual-app browser fixtures, ignored generated reports. No runtime dependency upgrades. |
| `docs/roadmap_phase5.md`, `docs/phase5-integration-checklist.md` | Unmodified roadmap copied from the ZIP and source-backed Phase 1–4 comparison, including missing originals and remaining gates. |

The starter patch passed its exact-source preflight and supplied Python patch
test before application. The applied shell was then adapted to fix real-app
integration gaps: mobile keyboard handling, dark controls and nested text,
paired status colors, the dashboard highlight, sibling notification positioning,
and printing. The standalone HTML preview was not substituted for the app.

The complete `<Routes>` block, `App` authentication/recovery/provider wrapper,
and `logout()` implementation compare byte-for-byte with the baseline.
No feature page, state store, command contract, auth implementation, migration,
permission definition, transaction operation, or business calculation changed.

## Verification

Story: opening the app follows the existing session check → authorized bootstrap
→ shell and route rendering; navigation and appearance then respond without
changing authorization or executing a business command. Browser auth/bootstrap
responses were intercepted locally, while SQL contracts were checked separately
with PGlite.

| Check | Final result |
| --- | --- |
| Starter source-anchor preflight and Python patch test | Pass before application. |
| Clean dependency installation | `npm ci --no-audit --no-fund` passed; existing dependency versions unchanged. |
| `npm run check` | Pass: ESLint, app TypeScript, 193 Vitest tests in 12 files, local SQL tests and Vite production build. Build used a synthetic URL/key, not a production resource. |
| Local SQL detail | 310 assertions (99 lifecycle + 55 legacy + 53 version + 103 retail); 6 Node test cases passed, 1 optional sanitized-profile rehearsal skipped because no profile was supplied. No remote SQL executed. |
| `npm run test:shell` | Pass: dedicated harness TypeScript check and 28/28 actual-app Chromium tests; 46.1 seconds. Chromium 156.0.8078.79, Playwright 1.65.0. |
| Harness types after clean install | `npm run test:shell:types` passed again. |
| Source and asset comparison | Auth wrapper, logout and route guards unchanged; all four brand assets match the supplied bytes. |
| Diff whitespace | `git diff --check` passed. |

Browser coverage includes 320/390/768/1024/1440px in both light and dark, no
horizontal page overflow, brand loading and full-height desktop sidebar,
admin/sales/inventory/viewer navigation, forbidden-route redirects, keyboard
focus and forward/reverse Tab trapping, Escape/close/navigation dismissal,
trigger focus return, desktop-resize cleanup, stored theme/reload and unavailable
appearance storage, dark catalog/sale dialog controls and dashboard contrast,
print chrome removal/light tokens/catalog content, fixture login and expired
recovery, successful SDK logout, rejected-client feedback and toast placement.

The fixture configuration overrides every public Supabase URL/key fallback with
`https://phase5-fixture.supabase.co` and a dummy public key. Browser interception
fulfills the permitted fixture endpoints, closes Realtime sockets and fails on
unexpected external requests or business commands. All 28 cases completed
without uncaught JavaScript exceptions or unexpected outbound/business requests.
The inherited Google Fonts stylesheet is fulfilled with empty CSS locally, so
screenshots use system fallback fonts. See [harness details](../tests/shell/README.md).

Successful logout exercises the installed SDK with a local endpoint. The error
feedback test injects a rejected client method result: the installed Auth SDK
clears its local session even on an HTTP sign-out failure, so that separate
server-error behavior is preserved rather than represented as a shell fix.

Reproduce the checks from the repository root:

```sh
npm ci --no-audit --no-fund
VITE_SUPABASE_URL=https://phase5-fixture.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=phase5-local-placeholder npm run check
npm run test:shell
git diff --check
```

Review screenshots are copied outside the generated test directory:
[desktop light](/workspace/phase5-review/shell-desktop-light.png),
[desktop dark](/workspace/phase5-review/shell-desktop-dark.png),
[mobile light](/workspace/phase5-review/shell-mobile-light.png),
[mobile dark](/workspace/phase5-review/shell-mobile-dark.png).
The generated HTML report is `/workspace/inventory-app/playwright-report/index.html`.
The complete local patch, including added files and original brand binaries, is
[/workspace/phase5-review/phase5-shell-v1.patch](/workspace/phase5-review/phase5-shell-v1.patch).

## Review boundaries

The complete [Phase 1–4 checklist](phase5-integration-checklist.md) distinguishes
existing source capabilities from original-prototype fidelity. The shared shell
is the only implemented integration slice. Inventory drawers/sheets and quick
actions, Sales mobile checkout and camera scanning, purchasing/receiving schema
and barcode work, labels, saved addresses and other feature changes remain open.

Still needed: the approved Inventory 2.0/2.2 and Sales 2.0 prototype exports
(the roadmap does not name their files),
`smartliving_phase3_purchases_deliveries.html`,
`smartliving_customer_addresses_tracking.html`,
`S-mart_Living_Design_System_v1.zip`, and
`S-mart_Living_Design_System_v1_Interactive.html`.

Local browser fixtures do not validate remote Supabase Auth configuration,
Realtime delivery, real concurrent sessions, physical scanner/printer behavior,
Safari/iPhone behavior, assistive technology or full WCAG conformance. The
existing PGlite suite validates SQL contracts in a synthetic local PostgreSQL
engine. Full feature color/token adoption and comparison with the missing
originals remain checklist items. Phase 6 advanced tracking remains deferred.
