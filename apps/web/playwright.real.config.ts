import { defineConfig } from '@playwright/test';

// Run only through scripts/verify-real-api.mjs: it owns a disposable PostgreSQL
// database and removes all test accounts and private attachments afterwards.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'real-data.spec.ts',
  outputDir: './test-results-real',
  workers: 1,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: '../../artifacts/qa/real-api-playwright.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:3300',
    viewport: { width: 1440, height: 1000 },
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_BIN ?? (process.platform === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm exec next dev -- --hostname 127.0.0.1 --port 3300',
    url: 'http://127.0.0.1:3300/login',
    reuseExistingServer: false,
    timeout: 120000,
    env: { NEXT_PUBLIC_DATA_MODE: 'api', NEXT_TEST_DIST_DIR: '.next-real-test' },
  },
});
