import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    env: {
      PORT: "3000",
      PICKUP_TEST_SEQUENCE: "ricochet,speed,heavy-shot,rapid-fire",
      PICKUP_TEST_POSITIONS: "180:120|240:120|360:120|420:120"
    }
  }
});
