# Phase 5 shell review

11 November 2026. Local branch: `design/phase5-shell-v1`, created from freshly fetched
`origin/master` at `44e82d1dc6c83ab392814abc40fe7a173487457d`.

The user-authorized slice is the shared app shell and an integration audit.
The initial local review checkpoint was completed before push or deployment.
On 11 November 2026 the user approved proceeding with the branch and draft PR.
The starter ZIP remains reference material; approval does not extend this slice
to feature migrations, merging, a production release or production Supabase work.

Before publication, the existing remote branch was found at `c10be10` with an
earlier shell implementation. Its ancestry, role unit tests, review evidence,
safe-area viewport, brand rewrite exclusion and complementary compatibility
styles are retained. The approved local mobile-focus hook and browser regression
harness are preserved in the reconciliation.

## Latest authenticated hosted QA — 11 November 2026

The refreshed environment has the ready QA credential and direct access to the
verified unique Preview. Real staging password login/JWT refresh and the
same-user owner bootstrap contract passed. Hosted owner shell QA now covers
320/390/768/1024/1440px in light/dark, all 13 routes, mobile focus/navigation,
appearance persistence, refresh, print, logout/token invalidation and the
expired-recovery screen. No business command, schema change, new deployment,
production operation or merge was performed.

The [authenticated QA report](phase5-authenticated-qa.md) records screenshots,
sanitized run evidence, harness-only corrections and remaining gates. Signup and
404 CSP findings remain open; the validation bundle's caught Zod eval capability
probe also generates nonblocking CSP reports. Real other-role/nonmember sessions,
recovery delivery and Realtime/concurrency remain separate pending evidence.
Earlier continuation sections below retain the prior checkpoint history.

## Shell diff

| Files | Change |
| --- | --- |
| `src/App.tsx`, `src/App.test.tsx` | Retained five-role and permission-flag unit coverage; approved primary/business logos, exact S-mart Living footer, shell-scoped light/dark preference and appearance toggle, permission-bound mobile dock, modal mobile-navigation semantics and inert background. |
| `src/design-system/useMobileSidebar.ts` | Move focus into mobile navigation, trap Tab/Shift+Tab, close on Escape, restore trigger focus, lock background scrolling and clear the modal on desktop resize. |
| `src/main.tsx` | Import tokens, reusable primitives CSS and the shell adapter after the existing stylesheet. |
| `src/design-system/tokens.css`, `components.css`, `SuiPrimitives.tsx` | Supplied Phase 4 foundations. Feature forms still use the existing shared components; wholesale primitive adoption is a later slice. |
| `src/design-system/app-theme.css` | Persistent Cool Glass sidebar and 6px desktop frame, full-row active state, solid work surfaces, mobile Quiet Glass Dock and safe-area spacing. Bridge existing controls/dialogs/text/status surfaces to semantic colors; preserve dashboard highlight contrast; keep notifications above the dock; reset print to light tokens and remove shell padding/chrome. Includes reduced-motion/transparency and forced-color fallbacks. |
| `index.html`, `vercel.json` | Retained safe-area viewport support and `/brand/` exclusion from the SPA rewrite. |
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
| `npm run check` | Pass: ESLint, app TypeScript, 201 Vitest tests in 13 files, local SQL tests and Vite production build. Build used a synthetic URL/key, not a production resource. |
| Local SQL detail | 310 assertions (99 lifecycle + 55 legacy + 53 version + 103 retail); 6 Node test cases passed, 1 optional sanitized-profile rehearsal skipped because no profile was supplied. No remote SQL executed. |
| `npm run test:shell` | Pass: dedicated harness TypeScript check and 28/28 actual-app Chromium tests; 1.1 minutes after branch reconciliation. Chromium 156.0.8078.79, Playwright 1.65.0. |
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

Current reconciliation screenshots are included in the branch:
[desktop light](design/phase5-shell-current-desktop-light.png) and
[mobile dark](design/phase5-shell-current-mobile-dark.png).

Additional local review screenshots are copied outside the generated test directory:
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

## Preview configuration and staging continuation

The existing branch preview for `c10be10` (`dpl_BP68dbkdK4VyfxGE59dSMU3DG8Lj`)
failed with `failed_config_load`: “Falta la configuración pública de Supabase
para compilar producción.” This Vite build mode is also used for preview bundles.
The missing Preview public URL/key must be supplied from a dedicated
non-production Supabase project; its hostname also needs a preview-specific CSP.
The production CSP and configuration guard are preserved. No production bindings
were copied or changed. At the original shell checkpoint, no remote backend
requests were used for QA.
A generated preview URL alone does not establish a working or safely isolated app.

The user subsequently authorized creating a separate staging project in
**SmartLiving Home**. Project `wvegljmwszvywhngcitr` now has the seven existing
retail migrations, and its public configuration is scoped only to Preview on
`design/phase5-shell-v1`. `scripts/preview-output.mjs` generates a preview-only
Build Output API bundle whose CSP permits only that staging backend; normal
builds retain the checked-in production configuration. Fifteen focused generator
tests cover routing, configuration mismatch rejection, metadata and cleanup of
owned preview output before a later production build.

At the initial staging checkpoint, hosted SQL role/cost/bootstrap/command checks
passed in a rollback-only transaction. No test users, products or memberships
persisted. This is database permission evidence; it is not proof of real Auth
sessions. Permanent test-account provisioning and authenticated hosted browser QA
were pending, the Cloud network policy blocked the staging/preview hosts, and
computer control failed to initialize.

### QA continuation — 11 November 2026

The continuation checked out PR #1's branch at
`61aff6c2e1bd78457aed515fec99f697e05db252` and verified network access before
backend checks. GitHub, the stable branch alias and staging project
`wvegljmwszvywhngcitr` are now permitted and reachable. The prior unique Preview
hostname still received a proxy `403`; permitting the branch alias does not
permit every unique deployment hostname.

The stable alias initially resolved to deployment
`dpl_7B9i4F6iWBooPC7YJ6ventfCupKx`, whose target was production and whose aliases
included production names. It was not modified or used for authenticated QA.
After user approval, a separate Preview rebuild was requested from the source
Preview at the branch SHA and reached `READY` as
`dpl_EnHgC91YWVszLTvJyCxEat21X97n` (Preview, `target: null`). The stable branch
alias now resolves to that Preview; the production origin still resolves to the
original production deployment, unmodified. Its identity and response evidence
are recorded in the
[staging setup and verification record](phase5-staging-setup.md#qa-continuation--11-november-2026).

With the user's explicit approval for temporary sharing of the new unique
Preview, connector requests verified current staging metadata/SHA, a staging-only
`connect-src` on the metadata response and correct HTML/PNG/CSS/JavaScript
responses. Main JavaScript referenced only staging. Missing brand/assets returned
`404 text/plain`, not SPA HTML, but their platform-generated error responses
retained the checked-in production `connect-src`. This narrow error-response CSP
inconsistency remains open; no executable error response or production request
was observed. Direct browser access to the new unique hostname still received
proxy `403`, and the user requested its policy addition. Connector response
checks do not establish authenticated hosted browser behavior.

Independent headless Chromium launched successfully despite the shared
computer-use initialization error. The actual local app on
`http://127.0.0.1:4180`, configured with the staging URL and public key, rendered
an enabled login form. Real browser CORS requests to staging returned Auth
health `200` and permission-denied responses for anonymous bootstrap and direct
product reads. No Auth/bootstrap response was mocked, no account logged in and
no business command executed. This proves browser-to-staging connectivity and
anonymous denials from a local origin; it does not prove authenticated or hosted
Preview behavior. The inherited Google Fonts request failed at the proxy;
there were no uncaught browser exceptions or unexpected request origins.

After `npm ci`, the local shell TypeScript check and all 28 Chromium regression
cases passed in 55.8 seconds; all 15 preview-output tests and `git diff --check`
also passed. Versions were Node 24.22.1, Playwright 1.65.0 and Chromium
156.0.8078.79 on Debian 13. These remain local fixture and generator results.

At the earlier read-only checkpoint staging had zero Auth users, memberships and
products. The user then created a confirmed, unbanned controlled staging account
and explicitly approved its first active owner membership, which was provisioned
and verified. A rollback-only SQL role-impersonation bootstrap parsed against
the current contract with the same UUID, owner role, DOP, empty commercial arrays
and one team member; it does not establish real Auth/JWT/browser login. The
[account checkpoint](phase5-staging-setup.md#credentials-and-remaining-authenticated-gate)
records the grant and evidence boundary. The known test account still needs
`PHASE5_QA_PASSWORD` supplied through environment secrets, and the unique Preview hostname is still
missing from the applied network policy. Public signup was found enabled
(`disable_signup=false`), contrary to the intended staging setup, while
anonymous users and email autoconfirm were disabled. This configuration gap and
the authenticated Preview, role, recovery and Realtime-delivery checks remain
open. No production configuration/data was changed and PR #1 was not merged.
