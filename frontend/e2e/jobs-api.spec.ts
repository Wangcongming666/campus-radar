import { test, expect } from "@playwright/test";
test.skip(process.env.API_E2E !== "1", "Requires an API-mode frontend server");
test("API jobs render server results and explain service failures", async ({ page }) => {
  await page.route("**/api/v1/jobs?*", route => route.fulfill({json:{data:[{id:"job-123",title:"Backend engineer",company:{name:"Example Corp"},cities:["Shanghai"],education:"BACHELOR",recruitmentType:"CAMPUS",canonicalUrl:"https://example.com/jobs/1",descriptionMd:"Job details",status:"OPEN"}],page:{page:1,size:20,total:1,hasMore:false},requestId:"test"}}));
  await page.goto("/jobs");
  await expect(page.getByText("Backend engineer")).toBeVisible();
  await expect(page.getByText("Example Corp")).toBeVisible();
  await page.unrouteAll();
  await page.route("**/api/v1/jobs?*", route => route.fulfill({status:503}));
  await page.reload();
  await expect(page.getByText(/岗位服务暂时不可用/)).toBeVisible();
});
