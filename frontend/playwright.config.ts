import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:4301', browserName: 'chromium', channel: 'msedge', headless: true },
  webServer: { command: 'npm start -- --host 127.0.0.1 --port 4301', url: 'http://127.0.0.1:4301', reuseExistingServer: false, timeout: 120000 },
});
