# Phase 5 dedicated staging setup

Prepared 11 November 2026 for the shared-shell preview on
`design/phase5-shell-v1`. This document describes a non-production installation;
it does not authorize a production database operation or import production data.

## Recorded setup status — 11 November 2026

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

`npm run test:preview-output` passed all 15 local regressions, including staging
origin guards, copied static assets, routing/cache/security headers, metadata,
ordinary-build no-op behavior and preview-to-production owned-output cleanup.
The focused suite is also part of `npm test` and therefore `npm run check`.

After rebuilding, verify the deployment's exact SHA, branch and preview target,
and check that asset requests return PNG/CSS/JS rather than SPA HTML. Functional
QA must use only the staging project and controlled users. Existing local
browser fixtures remain useful for shell regression, but they intercept Auth
and bootstrap and are not evidence of hosted-service behavior.

## Hosted browser verification blockers

The Cloud network policy currently blocks direct requests to the staging
hostname and stable branch preview alias. Requested host additions have not yet
been applied by the user:

- `wvegljmwszvywhngcitr.supabase.co`
- `inventory-app-git-design-phase5-81c276-lazytitan-dots-projects.vercel.app`
- The exact new deployment hostname, once returned by Vercel.

The attempted computer-use initialization also failed with
`gaas-browser node_repl sandbox cannot be disabled`. No available environment
change tool resolved that failure. Deployment status, generated files and
response headers can be inspected through the Vercel connector, but this does
not replace a real browser/Auth session.

Hosted login, recovery delivery, role-specific shell rendering and transaction
QA remain pending both access to the preview/staging hosts and a controlled
confirmed staging account. Do not present connector metadata, an accessible
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
