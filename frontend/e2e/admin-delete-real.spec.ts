import { test, expect, type Page } from "@playwright/test";
const row = { id: "77777777-7777-4777-8777-777777777777", version: 3, name: "测试目录公司", slug: "test-company", cities: [], tags: [], descriptionMd: "" };
async function fixture(page: Page, role = "ADMIN", conflict = false) {
  const requests: { method: string; url: string; csrf?: string }[] = [];
  let deleted = false;
  await page.route("**/api/v1/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname === "/api/v1/me") return route.fulfill({ json: { data: { id: "test-admin", version: 1, displayName: "管理验收", role, emailMasked: "t***@example.test", emailVerified: true, theme: "LIGHT", timezone: "Asia/Shanghai", preferences: { roles: [], cities: [], recruitmentTypes: [] } } } });
    if (url.pathname === "/api/v1/auth/csrf") return route.fulfill({ json: { data: { token: "admin-delete-csrf" } } });
    if (request.method() === "DELETE") {
      requests.push({ method: request.method(), url: request.url(), csrf: request.headers()["x-csrf-token"] });
      if (conflict) return route.fulfill({ status: 409, json: { error: { code: "CONTENT_REFERENCED", message: "该记录被用户投递引用，不会删除用户笔记。" } } });
      deleted = true; return route.fulfill({ status: 204 });
    }
    const data = url.pathname === "/api/v1/admin/companies" && !deleted ? [row] : [];
    return route.fulfill({ json: { data, page: { page: 1, size: 20, total: data.length, hasMore: false } } });
  });
  await page.goto("/admin"); await page.getByRole("button", { name: "公司资料", exact: true }).click();
  await expect(page.getByRole("heading", { name: row.name, exact: true })).toBeVisible();
  return requests;
}
test("admin confirms the exact catalog row before versioned CSRF deletion and list refresh", async ({ page }) => {
  const requests = await fixture(page);
  await page.getByRole("button", { name: "删除", exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toContainText(row.name); await expect(dialog).toContainText(row.id);
  expect(requests).toHaveLength(0);
  await dialog.getByRole("button", { name: "取消", exact: true }).click(); expect(requests).toHaveLength(0);
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "永久删除", exact: true }).click();
  await expect(page.getByRole("heading", { name: row.name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("已删除");
  expect(requests).toEqual([{ method: "DELETE", url: expect.stringContaining(`/admin/companies/${row.id}?version=3`), csrf: "admin-delete-csrf" }]);
});
test("referenced catalog deletion shows the server conflict and preserves the row", async ({ page }) => {
  await fixture(page, "ADMIN", true); await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "永久删除", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("不会删除用户笔记");
  await expect(page.getByRole("heading", { name: row.name, exact: true })).toBeVisible();
});
test("reviewers cannot access catalog deletion controls", async ({ page }) => {
  await fixture(page, "REVIEWER"); await expect(page.getByRole("button", { name: "删除", exact: true })).toHaveCount(0);
});
