import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /* Maximum time one test can run for. */
  timeout: 120 * 1000,
  expect: {
    timeout: 5000
  },
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'https://ecenciaapp.eastus2.cloudapp.azure.com/',
    // Apagamos el rastro y el video para que el navegador se cierre al instante al terminar
    trace: 'retain-on-failure',
    video: 'off',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'Desktop Chrome',
      use: { 
        channel: 'chrome',
        viewport: null,
        launchOptions: {
          args: ['--start-maximized']
        }
      },
    },
    {
      name: 'Tablet iPad',
      use: { ...devices['iPad (gen 7)'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  /* Run your local dev server manually before starting the tests */
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000,
  // },
});
