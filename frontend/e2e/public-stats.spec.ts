import { test, expect } from "@playwright/test";

test.skip(process.env.API_E2E !== "1", "Requires an API-mode frontend server");

test("homepage displays server statistics and reports unavailable service", async ({ page }) => {
  await page.route("**/api/v1/public/stats", route => route.fulfill({ json: { data: { companies: 7, openJobs: 8, experiences: 9, questions: 10, asOf: "2026-10-28T00:00:00Z", dataLabel: "ACTUAL" }, requestId: "test" } }));
  await page.goto("/");
  await expect(page.getByText("公开内容：7 家公司 · 8 个在招岗位 · 9 篇面经 · 10 道题")).toBeVisible();
  await page.unrouteAll();
  await page.route("**/api/v1/public/stats", route => route.fulfill({ status: 503 }));
  await page.reload();
  await expect(page.getByText("公开统计暂时不可用，请稍后重试。")).toBeVisible();
});
