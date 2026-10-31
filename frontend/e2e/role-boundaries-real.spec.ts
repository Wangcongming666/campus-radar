import { test, expect, type Page } from "@playwright/test";
const user = (role = "ADMIN") => ({
  id: "11111111-1111-1111-1111-111111111111",
  version: 1,
  displayName: role === "USER" ? "普通用户" : "平台管理员",
  role,
  status: "ACTIVE",
  email: "account@example.test",
  emailMasked: "a***@example.test",
  emailVerified: true,
  school: null,
  education: null,
  graduationYear: null,
  theme: "LIGHT",
  timezone: "Asia/Shanghai",
  preferences: {
    roles: [],
    cities: [],
    recruitmentTypes: [],
    graduationYear: null,
  },
  createdAt: "2026-10-29T00:00:00Z",
});
async function setup(page: Page, role = "ADMIN") {
  await page.route("**/api/v1/me", (r) =>
    r.fulfill({ json: { data: user(role) } }),
  );
  await page.route("**/api/v1/auth/csrf", (r) =>
    r.fulfill({ json: { data: { token: "role-test-csrf" } } }),
  );
  await page.route("**/api/v1/admin/**", (r) =>
    r.fulfill({
      json: { data: [], page: { page: 1, size: 20, total: 0, hasMore: false } },
    }),
  );
}
test("ADMIN navigation and routes exclude applicant functions", async ({
  page,
}) => {
  await setup(page);
  const personal: string[] = [];
  page.on("request", (request) => {
    if (
      /\/api\/v1\/(applications|planner|resumes|favorites|mock-sessions)/.test(
        request.url(),
      )
    )
      personal.push(request.url());
  });
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "主导航" });
  await expect(nav.getByRole("link", { name: "用户管理" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "投递看板" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "简历版本库" })).toHaveCount(0);
  await page.goto("/pipeline");
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/jobs/not-an-applicant-page");
  await expect(page).toHaveURL(/\/admin$/);
  expect(personal).toEqual([]);
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "求职偏好", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "账号设置", exact: true }),
  ).toBeVisible();
});
test("USER cannot enter management and has no management navigation", async ({
  page,
}) => {
  await setup(page, "USER");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "无管理权限" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "用户管理" }),
  ).toHaveCount(0);
});
test("administrator login ignores applicant returnTo and enters management", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/auth/login", (r) =>
    r.fulfill({ json: { data: user() } }),
  );
  await page.goto("/login?returnTo=%2Fpipeline");
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("account@example.test");
  await page.getByLabel("密码", { exact: true }).fill("Test-only-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
});
test("user management edits basic profile using server version without role or credential controls", async ({
  page,
}) => {
  await setup(page);
  let row = {
    ...user("USER"),
    id: "22222222-2222-2222-2222-222222222222",
    version: 7,
  };
  await page.route("**/api/v1/admin/users?*", (r) =>
    r.fulfill({
      json: {
        data: [row],
        page: { page: 1, size: 20, total: 1, hasMore: false },
      },
    }),
  );
  let patch: unknown;
  await page.route(
    "**/api/v1/admin/users/22222222-2222-2222-2222-222222222222",
    async (r) => {
      patch = r.request().postDataJSON();
      row = { ...row, ...r.request().postDataJSON(), version: 8 };
      await r.fulfill({ json: { data: row } });
    },
  );
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "编辑用户", exact: true }).click();
  await page
    .getByRole("textbox", { name: "学校", exact: true })
    .fill("接口更新的学校");
  await page.getByRole("button", { name: "保存用户信息", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("用户资料已更新");
  expect(patch).toEqual({ version: 7, school: "接口更新的学校" });
  await expect(
    page.getByText("接口更新的学校", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("密码", { exact: true })).toHaveCount(0);
});
test("management includes API-backed experience maintenance", async ({
  page,
}) => {
  await setup(page);
  await page.goto("/admin");
  await page.getByRole("button", { name: "面经维护", exact: true }).click();
  await expect(page.getByText("暂无记录。", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "新增面经维护", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "面经标题", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("来源与使用许可说明")).toBeVisible();
});
test("homepage discards previously fetched counts and cards when API goes down", async ({
  page,
}) => {
  let online = true;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/me", (r) =>
    r.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED" } } }),
  );
  await page.route("**/api/v1/public/stats", (r) =>
    r.fulfill(
      online
        ? {
            json: {
              data: {
                companies: 8,
                openJobs: 16,
                experiences: 0,
                questions: 16,
                dataLabel: "ACTUAL",
              },
            },
          }
        : { status: 503, json: { error: { message: "后端已停止" } } },
    ),
  );
  await page.route("**/api/v1/jobs?*", (r) =>
    r.fulfill(
      online
        ? {
            json: {
              data: [
                {
                  id: "from-api",
                  title: "后端岗位",
                  role: "backend",
                  company: { name: "后端企业" },
                  cities: [],
                  skills: [],
                  salary: null,
                },
              ],
              page: { page: 1, size: 10, total: 1, hasMore: false },
            },
          }
        : { status: 503, json: {} },
    ),
  );
  await page.route("**/api/v1/companies?*", (r) =>
    r.fulfill({
      json: {
        data: online ? [{ id: "company-from-api", name: "后端企业" }] : [],
      },
    }),
  );
  await page.route("**/api/v1/questions?*", (r) =>
    r.fulfill({ json: { data: [] } }),
  );
  await page.goto("/");
  await page.locator(".cr-stats").scrollIntoViewIfNeeded();
  await expect(page.locator(".cr-stat strong")).toHaveText([
    "8",
    "16",
    "0",
    "16",
  ]);
  online = false;
  await expect(page.locator(".cr-stat")).toHaveCount(0, { timeout: 15000 });
  await expect(
    page.locator(".cr-deck-card,.cr-recruit-card,.cr-cloud-logo"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "公开统计暂时不可用" }),
  ).toBeVisible();
});

test("submitted user experiences are reviewed rather than edited as administrator content", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/v1/admin/experiences?*", (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: "experience-from-user",
            version: 3,
            authorId: "user-owner",
            title: "用户已发布的面经",
            status: "PUBLISHED",
          },
        ],
        page: { page: 1, size: 20, total: 1, hasMore: false },
      },
    }),
  );
  await page.goto("/admin");
  await page.getByRole("button", { name: "面经维护", exact: true }).click();
  const panel = page.locator(".panel").filter({ hasText: "用户已发布的面经" });
  await expect(
    panel.getByRole("button", { name: "查看审核状态", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "查看与编辑", exact: true }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "删除", exact: true }),
  ).toHaveCount(0);
});
