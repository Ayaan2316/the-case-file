import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// tests run against the static export (`pnpm build` first) with system chrome,
// so no playwright browser download
export default defineConfig({
  testDir: "tests",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
  webServer: {
    command: "node scripts/serve.mjs",
    url: `http://localhost:${PORT}/resume/`,
    reuseExistingServer: true,
    env: { PORT: String(PORT) },
  },
});
