# Phase 5 dedicated staging setup

Prepared 11 November 2026 for the shared-shell preview on
`design/phase5-shell-v1`. This document describes a non-production installation;
it does not authorize a production database operation or import production data.

## Current authenticated QA status — 11 November 2026

The supplied checkpoint was restored before this continuation. In the refreshed
Cloud environment, `PHASE5_QA_PASSWORD` is ready and the enforced policy permits
the exact unique Preview and staging hosts. Real password login, JWT refresh,
same-user owner bootstrap, and the authenticated hosted shell are now verified
on Preview `dpl_EnHgC91YWVszLTvJyCxEat21X97n` at commit `61aff6c`.

Owner shell QA passed five viewport widths in both themes, all 13 routes,
mobile focus/navigation, refresh, print, real logout and logged-out reload.
Logout invalidated the tested refresh token. Expired recovery rendering passed;
recovery mail was not sent. Anonymous bootstrap and owner direct-table access
were denied. The final staging baseline remains one Auth user, one active owner,
zero products, zero documents and revision zero.

See the [authenticated QA report](phase5-authenticated-qa.md) for evidence,
harness corrections, browser diagnostics and remaining boundaries. Public signup
and plain-text 404 CSP findings remain open; a caught Zod eval capability probe
also generates a nonblocking CSP violation. Other-role/nonmember hosted sessions,
recovery delivery and real Realtime/concurrency remain pending. No production,
schema or business-data changes, merge, or new deployment occurred in this run.

The sections below preserve earlier checkpoint history; their pending credential
and owner-shell statements are superseded by this status.

## Initial recorded setup status — 11 November 2026

After explicit user selection of the **SmartLiving Home** organization, the
dedicated staging project `wvegljmwszvywhngcitr` was created. The parent setup
workflow inspected the empty project and applied all seven existing retail
migrations through the Supabase connector. No production database operation,
legacy import or production-data copy was performed.

The three branch-scoped Vercel Preview variables are configured for
`design/phase5-shell-v1`: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` and `PHASE5_STAGING_PROJECT_REF`. The configured
API origin is `https://wvegljmwszvywhngcitr.supabase.co`; no key is included in
this document.

At this setup checkpoint the hosted staging Auth user count and retail membership
count are both zero.
No persistent hosted test owner or authenticated browser session has been
provisioned or verified. The hosted SQL smoke below passed with ephemeral Auth
fixtures inside a transaction that was rolled back. An authorized confirmed
test account and initial membership are still needed for real Auth/browser
shell QA. The synthetic owner in the PGlite rehearsal below exists only in
that ephemeral local test.

## QA continuation — 11 November 2026

This continuation used PR #1's `design/phase5-shell-v1` branch at
`61aff6c2e1bd78457aed515fec99f697e05db252`. The checks below supersede the initial
network blocker record while preserving it as checkpoint history. No production
configuration/data was changed, no schema migration was applied and the PR was
not merged.

### Network and deployment identity

Network access was verified first. The enforced Cloud policy now permits
GitHub, `wvegljmwszvywhngcitr.supabase.co` and
`inventory-app-git-design-phase5-81c276-lazytitan-dots-projects.vercel.app`.
All three were reachable; unauthenticated Auth health returned the expected
missing-API-key response. The stable alias returned Vercel Authentication
protection. The prior unique Preview hostname
`inventory-56e5qjqkw-lazytitan-dots-projects.vercel.app` received proxy `403`.
Unique deployment host access must be checked separately from branch-alias
access.

The stable branch alias initially resolved to
`dpl_7B9i4F6iWBooPC7YJ6ventfCupKx`, reported with target `production` and
production aliases. That deployment was not modified or used for authenticated
QA. Alias naming therefore cannot establish the deployment's target or backend.

After user approval, a fresh Preview rebuild was requested:

| Identity | Recorded value |
| --- | --- |
| Source Preview | `dpl_nsBE3sg6MmVG2vDvCQW115Ej5Rf3` |
| Source commit | `61aff6c2e1bd78457aed515fec99f697e05db252` |
| New deployment | `dpl_EnHgC91YWVszLTvJyCxEat21X97n` |
| Unique hostname | `inventory-3tvfe5snn-lazytitan-dots-projects.vercel.app` |
| Target request | Target omitted, the documented Preview default; API target was `null` |
| Final deployment state | `READY`, Preview (`target: null`) |
| Stable branch alias | Now resolves to the new Preview deployment |
| Production origin | `inventory-app-nine-navy.vercel.app` still resolves to the original `dpl_7B9i4F6iWBooPC7YJ6ventfCupKx`, unmodified |

The user explicitly approved temporary sharing for this new Preview only. The
unique deployment access operation reused an expiring share link with about
23 hours remaining. No share token or link is recorded here. Authorized connector
requests to that unique Preview produced the following hosted-response evidence:

| Hosted request | Result |
| --- | --- |
| `/preview-environment.json` | HTTP `200`, JSON `environment: preview`, project ref `wvegljmwszvywhngcitr`, SHA `61aff6c2e1bd78457aed515fec99f697e05db252`; `Cache-Control: no-store`; `X-Robots-Tag: noindex, nofollow` |
| Live metadata CSP | `connect-src` permits only `'self'`, staging HTTPS and staging WSS |
| `/`, `/inventario`, `/recuperar`, both used brand PNGs, main CSS and main JavaScript | HTTP `200` with the expected HTML/PNG/CSS/JavaScript content types and staging-only CSP |
| `/sw.js` | HTTP `200`, JavaScript, `Cache-Control: no-store`, staging-only CSP |
| Main JavaScript backend references | Staging project only |
| `/assets/phase5-missing.js`, `/brand/phase5-missing.png` | HTTP `404`, `text/plain`, not SPA HTML |

The platform-generated `404` responses retain the checked-in production
`connect-src` header. This is a narrow Preview error-response CSP inconsistency:
the tested missing resources returned no executable response and no production
request occurred, but the evidence does not establish staging-only CSP on every
response. Record and resolve that error-response behavior before claiming
uniform Preview header isolation.

Direct requests to the new unique hostname still received proxy `403`; an
actual headless browser navigation to its approved share link failed with
`net::ERR_TUNNEL_CONNECTION_FAILED`. The user agreed to add and apply that exact
hostname; the latest observed policy still contained only the staging API and
stable branch alias. The
successful connector requests above do not replace authenticated
hosted browser QA.

Automatic approval review rejected the Vercel fetch operation because its access
mechanism creates or reuses a temporary share link that expands deployment
access. That rejected request was not retried. The later unique-Preview access
was a separate operation after explicit approval for that deployment. A later
access request through the stable alias was
rejected because automatic review treated that alias as production; it was not
retried or bypassed indirectly. Only the explicitly approved unique Preview
share was used for the successful connector checks.

### Real browser and staging read-only checks

Shared computer-use initialization again failed with
`gaas-browser node_repl sandbox cannot be disabled`, but independent headless
Chromium launched. The actual local Vite/React app at
`http://127.0.0.1:4180` used the staging project URL/public key and displayed an
enabled login form. Browser fetches used real CORS and real staging responses,
with no mocked Auth/bootstrap and no logged-in session:

| Check | Result |
| --- | --- |
| Auth health with public API key | HTTP `200`, GoTrue `v2.197.0` |
| Anonymous `retail_bootstrap` | HTTP `401`, SQLSTATE `42501`, permission denied for function |
| Anonymous `retail_products` read | HTTP `401`, permission denied for table |
| Browser exceptions / unexpected request origins | None |
| Inherited Google Fonts request | Failed proxy tunnel; fallback fonts used |

This is browser-to-staging connectivity and anonymous-denial evidence from a
local origin. It is not hosted Preview QA, a real Auth login, JWT refresh,
authenticated bootstrap, recovery delivery or Realtime-delivery evidence. No
business commands or persistent test records were created by these checks.

The earlier read-only staging checkpoint confirmed all seven migrations and zero
Auth users, retail memberships and products. `public.retail_revision` was the
only member of the `supabase_realtime` publication; membership alone does not prove
subscription delivery. Security advisors reported zero warnings/errors and seven
informational private-table no-policy findings. Performance advisors reported
one informational unindexed `legacy_issues` foreign key and twelve informational
unused-index findings on the empty staging project.

The public Auth settings response reported `disable_signup=false`,
`anonymous_users=false` and `mailer_autoconfirm=false`. Public signup is therefore
enabled, contrary to the intended setup below. This is an open staging
configuration gap; it was not silently changed as part of read-only QA.

### Credentials and remaining authenticated gate

At the initial continuation checkpoint the controlled account and owner
membership had not yet been provisioned. The requested environment secret names are `PHASE5_QA_EMAIL` and
`PHASE5_QA_PASSWORD`; no ready credentials existed at this checkpoint. Keep values
out of chat, source, screenshots and reports. Do not handcraft Auth rows or send
unsolicited invitations/recovery emails.

The user subsequently created the controlled staging Auth user
`ff90df83-254e-4bdc-8a57-565a406d42c9`, verified as confirmed and unbanned.
Automatic approval review initially rejected the first-owner grant because the
account-creation instruction did not explicitly approve that privilege grant.
After the user expressly approved the owner membership, a guarded insert for
that exact account succeeded. A follow-up read confirmed one active `owner`
membership and zero products.

A rollback-only SQL session used `SET LOCAL ROLE authenticated` and that exact
user's `request.jwt.claim.sub` to call `retail_bootstrap`. Its full result parsed
against the current `bootstrapSchema`: matching user UUID, `owner` role, DOP,
empty commercial arrays and one team member. This is SQL role-impersonation
evidence, not a real Auth API login, JWT/session or browser-authentication check.
No commercial records were created by the rehearsal.

The owner/account gate is complete. The test email is known from the controlled
account; `PHASE5_QA_PASSWORD` is still required through environment secrets
(`PHASE5_QA_EMAIL` can optionally override the known test email). The applied
custom hostname additions still contain only
the staging API and original stable branch alias; the unique Preview hostname
has not been added.

Authenticated hosted QA remains pending direct browser access to the unique
Preview hostname and those controlled credentials. Resume with real login,
same-user `bootstrapSchema` validation,
empty-shell rendering, reload/manual refresh/logout, then controlled role/cost
and route checks. Recovery delivery, two-session Realtime/concurrency, media and
printer/device checks retain their separate evidence requirements.

### Repeated local regressions

After `npm ci`, `npm run test:shell` passed its dedicated TypeScript check and all
28 actual-app Chromium cases in 55.8 seconds. `npm run test:preview-output` passed
15/15 and `git diff --check` passed. Versions: Node `24.22.1`, Playwright `1.65.0`,
Chromium `156.0.8078.79` on Debian 13. The generated report is
`/workspace/inventory-app/playwright-report/index.html`. These local fixtures
continue to intercept Auth/bootstrap and do not replace authenticated staging
evidence.

## What an empty project can show

The two public build variables alone let Vite compile. A new Supabase project
can support the existing login screen, but it cannot show the authenticated
shell until the retail schema and initial membership exist. `RetailProvider`
calls `retail_bootstrap()` after authentication; a missing RPC or unauthorized
member leaves the loading/error screen instead of the shell.

An authorized, confirmed owner with the seven migrations below is sufficient
to view the actual shell with empty business arrays. Catalog products and
commercial documents are optional for that first smoke test. Real transactions,
role-bound data and richer screenshots need separately seeded synthetic data.
Never copy production customers, users, media, documents or database backups.

Sources: `src/lib/supabase.ts`, `src/state/RetailProvider.tsx`,
`src/state/retailStore.ts`, `src/lib/contracts.ts`,
`supabase/migrations/20260924155832_retail_core.sql`.

## Fresh-project prerequisites and migration order

1. Verify the selected project reference is the new, explicitly non-production
   project. The production reference `twkpgzxkzdtgkkuahntr` is excluded from every
   staging setup and QA operation.
2. Verify Supabase-managed `auth.users`, `auth.uid()`, `anon`/`authenticated`
   roles, `storage.buckets` and RLS-enabled `storage.objects` exist. These are
   managed service dependencies, not tables to recreate from the PGlite tests.
3. Inspect the fresh project's tables and migration history before applying
   schema, and check its logs/advisories if setup fails. Do not replay scripts
   into an already populated project without reconciling migration history.
4. Apply the existing, versioned retail migrations in this exact order:

   - `20260924155832_retail_core.sql`
   - `20260924155835_retail_commands.sql`
   - `20260924155837_retail_read_api.sql`
   - `20260924160511_retail_deferred_constraint_security.sql`
   - `20260924160948_retail_legacy_archive_import.sql`
   - `20260924162735_retail_document_lifecycle.sql`
   - `20260924163549_retail_master_versions.sql`

These files create the retail tables, singleton business settings, permission
helpers, RPCs, revision counter, audit/idempotency infrastructure, version guards
and private media policies. The legacy/media file is needed for the current
document contract, media helpers and audit report, but defining it does not run
an import. Its legacy-source lookup is deferred until an import is explicitly
called. **Do not call `import_legacy`, `legacy_manifest`, or create legacy source
tables for a fresh staging installation.** The current command guard permits a
fresh installation without old `products`/`sales` tables.

The private `retail-product-media` bucket is created with a 10 MiB limit and
JPEG/PNG/WebP-only MIME types. An incompatible pre-existing bucket causes the
migration to stop for review. The core migration publishes only
`retail_revision` when `supabase_realtime` exists; operational tables are not
published. Verify this non-sensitive revision table is in the publication in
the hosted project before claiming Realtime behavior.

Do not run `docs/legacy/setup.sql`, `docs/legacy/002_shared_inventory.sql`, or
other historical/destructive setup as preparation. They describe an older
application and are unnecessary for this fresh installation.

## Auth and initial owner

The application exposes login and recovery, not public registration. A confirmed
Auth user alone does not grant retail access. Create a controlled staging test
account through an authorized Auth administration flow, with the server's
password rules and a securely delivered password. Do not handcraft a hosted
`auth.users` row from the minimal local-test schema. Do not send invitations or
recovery messages to real third parties as a setup side effect.

Once the confirmed test account exists, provision its first `owner` membership
as an explicit administrative operation on the verified staging project. For
example, using a parameter bound to that exact Auth UUID:

```sql
-- Bind $1 to the approved staging Auth user UUID. Verify exactly one row returns.
insert into public.retail_memberships(user_id,email,display_name,role,active)
select u.id,u.email,'Phase 5 staging owner','owner',true
from auth.users u
where u.id=$1::uuid
  and u.email_confirmed_at is not null
  and (u.banned_until is null or u.banned_until<now())
  and not exists(select 1 from public.retail_memberships);
```

The guard avoids silently replacing existing memberships. An empty result is a
setup mismatch to investigate, not a reason to grant broader access. Existing
owners can subsequently assign the other controlled test accounts through the
normal team workflow; `set_member_role` does not create Auth users.

Keep public/anonymous signup disabled for the staging business. Configure Auth
site/redirect URLs for the exact preview origin(s), including
`/recuperar`, because the client uses `${window.location.origin}/recuperar` for
password recovery. Prefer the stable branch alias plus explicitly needed
deployment origins over a broad wildcard. Verify an allowed redirect and an
expired link separately; a login-only check does not prove recovery delivery.

## Preview-only application configuration

The following Config/public values are set only for Vercel **Preview**, scoped
to `design/phase5-shell-v1`:

- `VITE_SUPABASE_URL`: the verified staging project's HTTPS API origin.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: an enabled publishable key for that same project.
- `PHASE5_STAGING_PROJECT_REF`: `wvegljmwszvywhngcitr`, the generator's explicit
  non-production project allowlist value.

The app also accepts `NEXT_PUBLIC_*` compatibility names; the `VITE_*` values
take precedence. Verify branch and environment targeting so no production or
other preview configuration is replaced. A publishable key is expected to enter
the browser bundle; `service_role`, secret keys and database passwords must not.

The checked-in `vercel.json` keeps its production CSP byte-identical. The build
script now runs `scripts/preview-output.mjs` after Vite. Only when
`VERCEL_ENV=preview` does the generator require the allowlisted staging reference
and exact effective API origin. `VITE_SUPABASE_URL` takes precedence over
`NEXT_PUBLIC_SUPABASE_URL`; a production, missing or other-project origin causes
preview generation to fail before replacing output.

The generator copies only `dist` into `.vercel/output/static` and writes Build
Output API v3 `.vercel/output/config.json`. It derives response headers from the
existing Vercel configuration and replaces only CSP `connect-src` with:

```text
connect-src 'self' https://wvegljmwszvywhngcitr.supabase.co wss://wvegljmwszvywhngcitr.supabase.co
```

It retains the other security directives and individual cache rules, adds
`X-Robots-Tag: noindex, nofollow`, checks the filesystem before the same SPA
fallback, and excludes missing asset/brand requests from SPA HTML rewrites.
`preview-environment.json` contains only `environment`, `projectRef` and
`gitCommitSha`, never a key. The metadata route uses `Cache-Control: no-store`.

Normal and production builds do not generate preview routes. If an earlier
local preview output is positively identified by this generator's metadata,
the build removes that owned output before normal static deployment; unrelated
output is left untouched. This prevents a reused local build workspace from
retaining staging routing during a later production build.

Vercel's official [Build Output API configuration](https://vercel.com/docs/build-output-api/configuration)
documents the v3 output contract. Its
[static-build implementation](https://github.com/vercel/vercel/blob/main/packages/static-build/src/index.ts)
detects v3 output after the build command and returns that final form before
normal static handling. Verify the actual deployed response header and metadata
SHA as well; successful generation alone is not hosted-response evidence.

The first hosted build served the v3 assets and correct environment metadata,
but Vercel's source-config header merge still replaced the ordinary generated
CSP header. The generator therefore also sets the staging CSP through a final
`response.headers` transform. The live header must be checked after this fix;
v3 asset precedence alone does not establish response-header precedence.

`npm run test:preview-output` passed all 15 local regressions, including staging
origin guards, copied static assets, routing/cache/security headers, metadata,
ordinary-build no-op behavior and preview-to-production owned-output cleanup.
The focused suite is also part of `npm test` and therefore `npm run check`.

After rebuilding, verify the deployment's exact SHA, branch and preview target,
and check that asset requests return PNG/CSS/JS rather than SPA HTML. Functional
QA must use only the staging project and controlled users. Existing local
browser fixtures remain useful for shell regression, but they intercept Auth
and bootstrap and are not evidence of hosted-service behavior.

## Initial hosted browser verification blockers

At the initial setup checkpoint the Cloud network policy blocked direct requests
to the staging hostname and stable branch preview alias. Requested host additions
had not yet been applied by the user:

- `wvegljmwszvywhngcitr.supabase.co`
- `inventory-app-git-design-phase5-81c276-lazytitan-dots-projects.vercel.app`
- The exact new deployment hostname, once returned by Vercel.

The initial attempted computer-use initialization also failed with
`gaas-browser node_repl sandbox cannot be disabled`. No available environment
change tool resolved that failure. Deployment status, generated files and
response headers can be inspected through the Vercel connector, but this does
not replace a real browser/Auth session.

At that checkpoint hosted login, recovery delivery, role-specific shell rendering
and transaction QA remained pending access to the preview/staging hosts and a
controlled confirmed staging account. See the continuation above for the updated
access and credential status. Do not present connector metadata, an accessible
login page or the local fixture suite as completed authenticated hosted QA.

## Hosted staging SQL smoke and advisory review

On 11 November 2026 the parent workflow used the staging connector to run a
single SQL transaction against `wvegljmwszvywhngcitr`. It created ephemeral Auth
and membership fixtures, exercised the existing commands/permissions, and ended
with `ROLLBACK`. It did not use the production project or import production data.

| Hosted staging SQL check | Result |
| --- | --- |
| Owner command execution and bootstrap | Pass |
| Sales and viewer bootstrap omit cost fields | Pass |
| Inventory role retains purchase access | Pass |
| Direct operational-table read denied | Pass |
| Anonymous bootstrap denied | Pass |
| Persistent Auth users, products and memberships after rollback | All zero |

This is server-side SQL/permission evidence with an impersonated test identity.
It does not prove actual Auth API login, JWT/session behavior, recovery email
delivery, browser networking or Realtime delivery. The zero persistent counts
mean this smoke test does not create a reusable login for the preview.

The staging advisory review reported **zero errors** and seven informational
findings for RLS enabled without policies on private tables
([linter 0008](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).
These findings match the private schema's deny-direct-access design: its table
privileges are revoked and controlled functions mediate access. They are retained
as advisory evidence, not treated as a full security certification.

## Minimal hosted verification

- Login with the controlled confirmed owner; assert bootstrap parses against
  `bootstrapSchema`, returns that same user UUID, DOP settings and empty business
  arrays. Confirm the shell appears without needing invented commercial data.
- Verify anonymous/nonmember bootstrap and direct operational-table access are
  denied; verify member-specific costs and routes using controlled role accounts.
- Verify refresh/logout, expiry/recovery redirects, theme storage, navigation,
  mobile focus, brand responses and console/network errors on the exact preview.
- Seed only synthetic business records through the existing authorized commands
  for subsequent feature flows. Retain role checks, operation UUID retries and
  snapshots; do not disable constraints, grant CRUD or bypass authorization.
- Run hosted security/performance advisors and inspect Realtime configuration
  before asserting those boundaries. Actual two-session concurrency, media,
  recovery delivery and printer checks remain separate from an empty-shell smoke.

## Local fresh-install rehearsal

On 11 November 2026 an ephemeral PGlite database applied all seven existing
migration files to minimal simulated Auth/Storage service schemas. No legacy
business tables, production data or remote connection were used. Results:

| Check | Result |
| --- | --- |
| All seven migrations on a fresh synthetic database | Pass |
| No automatically seeded personal membership | Pass |
| Confirmed synthetic owner bootstrap against current Zod contract | Pass |
| Empty commercial arrays and empty legacy audit report | Pass |
| Direct operational table read denied to authenticated user | Pass |
| Bootstrap denied to a nonmember UUID | Pass |

This focused rehearsal proves the source can initialize without legacy source
tables. It does not simulate the full hosted Auth API, email delivery, Storage
service, publication delivery, or concurrent PostgreSQL sessions. The existing
`master-versions.test.mjs` likewise applies all migration files without legacy
source tables and covers the command/version behavior in local PGlite.
