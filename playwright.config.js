// End-to-end tests: the built frontend + the real backend (in-memory database), driven in a real browser.
// Run with `npm run test:e2e`. Locally this uses the installed Microsoft Edge; on CI set PW_CHANNEL=chromium
// after `npx playwright install chromium`.
import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = 3100;
const CONTROL_PORT = 3101;
const FRONTEND_PORT = 4174;
const channel = process.env.PW_CHANNEL || 'msedge';

export default defineConfig({
  testDir: './e2e',
  // One backend with one in-memory database is shared by every test, so run them one at a time
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: channel === 'chromium' ? undefined : channel } },
  ],
  webServer: [
    {
      command: 'node test/support/e2e-server.js',
      cwd: './backend',
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        PORT: String(BACKEND_PORT),
        E2E_CONTROL_PORT: String(CONTROL_PORT),
        JWT_SECRET: 'e2e-access-secret-0123456789abcdef',
        JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef',
      },
    },
    {
      // Test the production build (lazy chunks and all), pointed at the e2e backend
      command: `npx vite build --outDir dist-e2e --emptyOutDir --logLevel warn && npx vite preview --outDir dist-e2e --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_API_URL: `http://localhost:${BACKEND_PORT}` },
    },
  ],
});
