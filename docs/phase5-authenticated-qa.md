# Phase 5 authenticated staging QA

11 November 2026. Repository: `LazyTitan-dot/inventory-app`, draft PR #1,
branch `design/phase5-shell-v1`.

The owner empty-shell QA passed on the verified hosted staging Preview. The
final complete browser run passed all nine check groups; a separate Auth
continuation confirmed rejection of the old refresh token after logout. This
record distinguishes real hosted-service evidence from local fixtures and SQL
role impersonation.

## Verified environment and deployment

| Boundary | Confirmed evidence |
| --- | --- |
| Controlled credential | `PHASE5_QA_PASSWORD` is configured and reported ready in the active Cloud environment. Its value is excluded from source and reports. |
| Network policy | Current observations report the policy enforced; staging and the exact unique Preview hostname are allowed. |
| Staging | `wvegljmwszvywhngcitr`; no production project is used for these checks. |
| Deployment | `dpl_EnHgC91YWVszLTvJyCxEat21X97n`, `READY`, Preview (`target: null`). |
| Exact Preview origin | `https://inventory-3tvfe5snn-lazytitan-dots-projects.vercel.app` |
| Tested commit | `61aff6c2e1bd78457aed515fec99f697e05db252` |
| Hosted metadata | Identifies the same commit, `environment: preview` and staging reference. |
| Protected Preview access | The user's explicit authorization for temporary sharing of this unique Preview was reused. Share URLs/tokens are kept private. |

The stable branch alias previously resolved to a production deployment, as
recorded in the supplied checkpoint. This continuation uses the verified unique
Preview origin rather than inferring environment safety from an alias name.

## Real Auth and API checks

These requests used the actual staging Auth and REST services, with no mocked
Auth/bootstrap responses and no SQL role impersonation.

| Check | Result |
| --- | --- |
| Controlled account password login | HTTP `200` |
| Refresh-token exchange | HTTP `200` |
| Authenticated `retail_bootstrap` | Parsed against the current `bootstrapSchema`; matching approved Auth UUID `ff90df83-254e-4bdc-8a57-565a406d42c9`, `owner` role and DOP settings. |
| Empty-business baseline | Products, variants, stocks, contacts, documents, document items, movements, deliveries and promotions are empty; team contains one member. |
| Anonymous `retail_bootstrap` | HTTP `401`, SQLSTATE `42501` |
| Owner direct operational product-table read | HTTP `403`, SQLSTATE `42501` |
| Real UI logout | HTTP `204`; signed-out page remains signed out after reload. |
| Previously held refresh token after logout | HTTP `400`, `refresh_token_not_found`; this verifies refresh-session rejection, not immediate invalidation of an already issued access token. |

The direct-table denial is expected: authorized retail access uses the controlled
RPC contract. Password login and refresh establish real Auth/JWT evidence that
the earlier rollback-only SQL rehearsal could not provide.

## Hosted owner shell results

The actual hosted Preview completed these checks using the controlled owner's
real Auth session and bootstrap. Auth/bootstrap responses were not mocked.

| Check | Result |
| --- | --- |
| Login, bootstrap, reload and manual refresh | Passed |
| Responsive appearance | Passed at 320, 390, 768, 1024 and 1440px in both light and dark; no horizontal page overflow. |
| Theme persistence | Passed after reload. |
| Mobile navigation | Focus trap, forward/reverse Tab, Escape, trigger focus restoration, navigation dismissal and desktop-resize cleanup passed. |
| Owner routes | All 13 owner routes rendered: summary, inventory, sales, purchases, customers, suppliers, quotes, after-sales, deliveries, promotions, reports, audit and settings. |
| Print | Inventory empty-state retained; shell chrome hidden; light color scheme and zero content bottom padding. |
| Logout | Real UI logout `204`, signed-out reload and rejection of the old refresh token passed. |
| Expired recovery | Error remained outside the authenticated shell. No recovery email was requested. |

Earlier attempts corrected harness expectations for the `Inventario 0` link
name and the deliberately print-hidden `.page-header`; the final full rerun
passed without an application source change.

The final full browser run reported zero uncaught exceptions, zero unexpected
requests and zero HTTP error responses. All 236 loaded asset responses checked
had staging-only CSP. Fifteen staging WebSocket connections exchanged 30 frames
without socket errors. This is connection/handshake evidence only; no business
revision event or two-session delivery was tested. The separate Auth
continuation also reported zero uncaught exceptions and zero unexpected requests.

Runtime versions: Node `24.22.1`, Playwright `1.65.0` and Chromium
`156.0.8078.79`.

The inherited Google Fonts request failed with
`net::ERR_TUNNEL_CONNECTION_FAILED`; fallback fonts were used. Reloads also
produced benign `net::ERR_ABORTED` request cancellations. These observed network
failures are retained in the browser evidence rather than described as an
error-free network run.

## Static response checks

An independent read-only request pass reproduced the exact Preview identity and
staging-only CSP on metadata, `/`, `/inventario`, `/recuperar`, five referenced
JavaScript chunks, the main CSS, both used brand PNGs and `/sw.js`. Each returned
HTTP `200` with its expected content type. The JavaScript contains the staging
reference and no production project reference. The missing JavaScript/PNG probes
returned `404 text/plain` and reproduced the error-response CSP finding below.
The current Auth settings response also reproduced the public-signup finding.

## Evidence and source references

- [Final complete hosted browser JSON](/workspace/phase5-qa-evidence/hosted-qa-results.json): all nine check groups passed, including print, logout and expired recovery.
- [Scoped print/Auth continuation JSON](/workspace/phase5-qa-evidence/auth-final-results.json): passed print, logout, signed-out refresh rejection and expired recovery.
- [Real Auth/API summary](/workspace/phase5-qa-evidence/api-qa-results.json).
- [Independent static response JSON](/workspace/phase5-qa-evidence/static-qa-results.json).
- [Earlier broad-run JSON](/workspace/phase5-qa-evidence/hosted-shell-qa-results.json): retained harness-failure history, superseded by the final complete run.
- Screenshots: [desktop light](/workspace/phase5-qa-evidence/owner-1440-light.png), [desktop dark](/workspace/phase5-qa-evidence/owner-1440-dark.png), [mobile light](/workspace/phase5-qa-evidence/owner-390-light.png), [mobile dark](/workspace/phase5-qa-evidence/owner-390-dark.png), [inventory print](/workspace/phase5-qa-evidence/owner-inventory-print.png).

The bootstrap contract is in [contracts.ts](../src/lib/contracts.ts); shell,
navigation and route permissions are in [App.tsx](../src/App.tsx); mobile focus
handling is in [useMobileSidebar.ts](../src/design-system/useMobileSidebar.ts).
Existing print behavior is defined by [styles.css](../src/styles.css#L2078)
and [app-theme.css](../src/design-system/app-theme.css#L416). These local evidence
files contain sanitized results; they do not contain passwords, sessions or
temporary share tokens.

## Retained findings

1. Staging public Auth signup is enabled (`disable_signup=false`), contrary to
   the intended closed staging setup. Current read-only settings confirm
   anonymous users and email autoconfirm disabled. This configuration finding
   remains open.
2. Platform-generated missing asset/brand `404 text/plain` responses retain the
   checked-in production `connect-src` policy. Tested SPA routes and actual
   executable/image assets use the staging-only CSP. No executable missing-file
   response or production request was observed. Uniform Preview error-response
   header isolation remains unproven.
3. The final browser run recorded 17 CSP `script-src` violations blocking `eval`,
   observed per navigation from `validation-B44qH8my.js`. They were traced to the installed Zod
   [`allowsEval` capability probe](/workspace/inventory-app/node_modules/zod/src/v4/core/util.ts:517),
   which attempts `new Function` inside a caught fallback. Validation and the
   tested application flows continued successfully, so this is a nonblocking
   CSP-noise finding. A separate fix can configure `z.config({ jitless: true })`
   before schemas are created; do not weaken CSP to accommodate the probe.
   No application source fix is included in this QA continuation.

## Pending evidence boundaries

- Real hosted sessions for controlled nonmember and other-role accounts;
  server role-impersonation and local navigation fixtures remain distinct evidence.
- Recovery redirect allowlisting and actual controlled-mailbox delivery. Expired
  recovery-page rendering alone does not establish recovery delivery.
- Real Realtime event delivery and two-session concurrency. Publication membership
  and a connected socket alone do not establish either behavior.
- Synthetic transaction workflows, idempotent retries, role-bound cost visibility
  with populated data, media access and relevant snapshot/audit checks.
- Physical scanners/printers, Safari/iPhone, assistive technology and full
  accessibility review.

The previously passing 28 local shell tests and 15 preview-output tests retain
their original scope. They do not substitute for the pending hosted boundaries.
Final staging counts remain one Auth user, one active owner, zero products,
zero documents and revision zero. A final read confirmed zero remaining sessions
for the controlled test user after logout. No new accounts or privilege grants were
created for this continuation. No emails, schema changes or business commands
were issued. Production configuration/data remain unchanged and PR #1 was not
merged. Phase 1–4 feature-prototype integration and Phase 6 tracking remain
outside this shell QA record.
