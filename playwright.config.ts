import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// The sentinel is intercepted by tests/shell/fixtures.ts. It is never a real project.
const fixtureUrl = 'https://phase5-fixture.supabase.co';

export default defineConfig({
  testDir: './tests/shell',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4178',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run dev -- --port 4178 --mode shell-test',
    url: 'http://127.0.0.1:4178',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: fixtureUrl,
      NEXT_PUBLIC_SUPABASE_URL: fixtureUrl,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_shell_fixture_only',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_local_shell_fixture_only',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_local_shell_fixture_only',
    },
  },
});
