import { test, expect } from "@playwright/test";

test.skip(process.env.API_REAL_E2E !== "1", "Requires real backend and isolated MySQL");
test("homepage displays statistics returned through the real backend", async ({ page, request }) => {
  const response = await request.get("/api/v1/public/stats");
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  expect(data.dataLabel).toBe("ACTUAL");
  await page.goto("/");
  await expect(page.getByText(`公开内容：${data.companies} 家公司 · ${data.openJobs} 个在招岗位 · ${data.experiences} 篇面经 · ${data.questions} 道题`)).toBeVisible();
});
