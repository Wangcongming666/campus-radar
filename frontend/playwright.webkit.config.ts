import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  outputDir: "qa/webkit-test-results",
  use: { ...base.use, browserName: "webkit", launchOptions: {} },
  reporter: [
    ["list"],
    ["json", { outputFile: "qa/playwright-webkit-results.json" }],
  ],
});
