import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'auth-api.spec.ts',
  outputDir: './test-results-api',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath:
        process.env.CHROME_BIN ??
        (process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : undefined),
    },
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  webServer: {
    command: 'npm exec next dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/login',
    env: { NEXT_PUBLIC_DATA_MODE: 'api' },
    reuseExistingServer: false,
    timeout: 120000,
  },
});
