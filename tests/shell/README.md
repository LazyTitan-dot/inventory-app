# Local shell browser regressions

Run `npm ci` and `npm run test:shell` from the repository root. The configuration
uses `/usr/bin/chromium` when present, or Playwright's installed Chromium. Set
`CHROMIUM_PATH` for another Chromium executable, or run
`npx playwright install chromium` to install the bundled browser.

The suite starts the real Vite/React app on `127.0.0.1:4178` using a dedicated
`shell-test` mode. Every public Supabase URL/key fallback is overridden with the
synthetic `phase5-fixture.supabase.co` sentinel and a dummy key. Browser routing
fulfills authentication and `retail_bootstrap` locally, closes Realtime sockets,
and rejects unrecognized external requests and all business commands. No remote
Supabase project, data, credentials, account, or deployment is used.

The legacy Google Fonts stylesheet request is fulfilled locally with empty CSS;
system fallback fonts are used. The shell already selects a system font stack.
Service workers are blocked so an old installation cannot supply app resources.

Coverage includes:

- Light/dark rendering and no page overflow at 320, 390, 768, 1024, and 1440 px.
- Approved brand image loading and full-height desktop sidebar.
- Existing admin, sales, inventory, and viewer navigation/route permission rules.
- Mobile More menu focus, forward/reverse Tab trapping, Escape, close-button and
  navigation dismissal, focus return, and desktop resize cleanup.
- Appearance persistence and unavailable appearance-storage fallback.
- Readable opaque controls in actual inventory/sale dialogs and the dashboard's
  dark panel, including selected text/background contrast calculations.
- Print chrome removal, light print tokens, and preservation of catalog content.
- Mocked login, expired recovery, and successful SDK logout.
- A test-only rejected `auth.signOut` result exercises the shell's error message,
  retry, and notification position above the dock. This is deliberately separate
  from an HTTP sign-out failure: the installed Supabase Auth SDK removes its
  local session even when its server logout returns an error. That existing SDK
  behavior is preserved; this test does not claim that a server rejection keeps
  the authenticated shell mounted.

Every case fails on an uncaught browser exception or an unexpected outbound
request. HTML results are written to ignored `playwright-report/`; screenshots
(390/1440 px in both themes) and failure traces go to ignored `test-results/`.

These fixtures verify shell integration and existing client boundaries. They
do not certify remote authentication, server authorization, full business flows,
screen readers, other browsers, real scanners/devices, or physical printers.
The existing Vitest and local PGlite suites cover their respective contracts.
