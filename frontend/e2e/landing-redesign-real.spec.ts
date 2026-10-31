import { test, expect, type Page } from "@playwright/test";
const jobs = Array.from({ length: 5 }, (_, i) => ({
  id: `backend-job-${i}`,
  title: [
    "后端返回的前端岗位",
    "后端返回的算法岗位",
    "后端返回的产品岗位",
    "后端返回的Java岗位",
    "后端返回的设计岗位",
  ][i],
  role: ["frontend", "algorithm", "product", "backend", "design"][i],
  company: { name: `接口企业${i + 1}` },
  cities: ["杭州"],
  skills: ["技术基础"],
  salary: null,
}));
async function fixture(
  page: Page,
  mode: "populated" | "empty" | "error" = "populated",
  signedIn = false,
) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill(
      signedIn
        ? {
            json: {
              data: {
                id: "account-from-api",
                displayName: "接口用户",
                role: "USER",
              },
            },
          }
        : { status: 401, json: { error: { code: "UNAUTHORIZED" } } },
    ),
  );
  await page.route("**/api/v1/public/stats", (route) =>
    route.fulfill(
      mode === "error"
        ? { status: 503, json: {} }
        : {
            json: {
              data: {
                companies: mode === "empty" ? 0 : 5,
                openJobs: mode === "empty" ? 0 : 5,
                experiences: 0,
                questions: mode === "empty" ? 0 : 2,
                dataLabel: "ACTUAL",
              },
            },
          },
    ),
  );
  await page.route("**/api/v1/companies?*", (route) =>
    route.fulfill({
      json: {
        data:
          mode === "populated"
            ? [{ id: "backend-company", name: "接口企业1" }]
            : [],
      },
    }),
  );
  await page.route("**/api/v1/questions?*", (route) =>
    route.fulfill({
      json: {
        data:
          mode === "populated"
            ? [{ id: "backend-question", title: "后端返回的练习题" }]
            : [],
      },
    }),
  );
  await page.route("**/api/v1/jobs?*", (route) => {
    if (mode === "error") return route.fulfill({ status: 503, json: {} });
    const url = new URL(route.request().url());
    const values =
      mode === "empty"
        ? []
        : jobs.filter(
            (job) =>
              !url.searchParams.get("role") ||
              url.searchParams.get("role") === job.role,
          );
    return route.fulfill({
      json: {
        data:
          url.searchParams.get("size") === "2" ? values.slice(0, 2) : values,
        page: { page: 1, size: 10, total: values.length, hasMore: false },
      },
    });
  });
}
for (const width of [1440, 768, 390])
  test(`${width}px: public homepage uses API records and server filters`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await fixture(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
      page.locator('.cr-deck-card[aria-hidden="false"]'),
    ).toContainText("后端返回的前端岗位");
    await page
      .getByRole("textbox", { name: "搜索岗位、公司或技能关键词" })
      .focus();
    await expect(page.locator("#home-hot-search")).toBeVisible();
    await page.getByLabel("预览岗位方向").selectOption("algorithm");
    await expect(page.locator(".cr-mini-job")).toHaveCount(1);
    await expect(page.locator(".cr-mini-job")).toContainText(
      "后端返回的算法岗位",
    );
    await expect(page.locator(".cr-board-card")).toHaveCount(0);
    await page.getByRole("tab", { name: /面试有底气/ }).click();
    await expect(page.getByRole("tabpanel")).toContainText("后端返回的练习题");
    await page.getByRole("tab", { name: /面试有底气/ }).press("Home");
    await expect(page.getByRole("tabpanel")).toContainText(
      "登录后查看自己的求职记录",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
test("empty API never falls back to sample jobs, companies or people", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, "empty");
  await page.goto("/");
  await page.locator(".cr-stats").scrollIntoViewIfNeeded();
  await expect(page.locator(".cr-stat strong")).toHaveText([
    "0",
    "0",
    "0",
    "0",
  ]);
  await expect(
    page.locator(
      ".cr-deck-card,.cr-recruit-card,.cr-cloud-logo,.cr-voice,.cr-board-card",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".cr-deck-stage")).toContainText("暂无在招岗位");
  await expect(page.locator(".cr-company-cloud")).toContainText("暂无收录企业");
});
test("API failures show unavailable states without fabricated records", async ({
  page,
}) => {
  await fixture(page, "error");
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: "公开统计暂时不可用" }),
  ).toBeVisible();
  await expect(page.locator(".cr-deck-stage")).toContainText(
    "岗位暂时无法加载",
  );
  await expect(page.locator(".cr-recruit-card,.cr-deck-card")).toHaveCount(0);
});
test("real-record carousel supports autoplay, pause and dragging", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/");
  await expect(
    page.locator('.cr-deck-card[aria-hidden="false"]'),
  ).toContainText("后端返回的算法岗位", { timeout: 7000 });
  await page.getByRole("button", { name: "暂停首屏岗位" }).click();
  await page.locator("#opportunities").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "下一组招聘岗位" }).click();
  await expect(
    page.getByRole("button", { name: "招聘轮播第 2 页" }),
  ).toHaveClass("active");
  await page.getByRole("button", { name: "上一组招聘岗位" }).click();
  await page.getByRole("button", { name: "暂停招聘轮播" }).click();
  await expect
    .poll(() =>
      page
        .locator(".cr-carousel-track")
        .evaluate((node) =>
          Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).m41),
        ),
    )
    .toBeLessThan(1);
  const box = await page.locator(".cr-carousel-viewport").boundingBox();
  if (!box) throw new Error("carousel missing");
  await page.mouse.move(box.x + 500, box.y + 150);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 150, { steps: 18 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "招聘轮播第 2 页" }),
  ).toHaveClass("active");
});
test("signed-in task controls persist server version and never use local sample state", async ({
  page,
}) => {
  await fixture(page, "populated", true);
  let status = "TODO";
  await page.route("**/api/v1/auth/csrf", (r) =>
    r.fulfill({ json: { data: { token: "test-csrf" } } }),
  );
  await page.route("**/api/v1/applications/board", (r) =>
    r.fulfill({
      json: {
        data: {
          items: [],
          boardVersion: 1,
          columns: ["PENDING"],
          stats: { total: 0, applied: 0, interviewing: 0, offers: 0 },
          truncated: false,
        },
      },
    }),
  );
  await page.route("**/api/v1/planner/tasks?*", (r) =>
    r.fulfill({
      json: {
        data: [
          {
            id: "task-from-backend",
            version: 4,
            title: "来自后端的准备任务",
            status,
          },
        ],
      },
    }),
  );
  await page.route("**/api/v1/planner/tasks/task-from-backend", async (r) => {
    expect(r.request().method()).toBe("PATCH");
    expect(r.request().postDataJSON()).toEqual({ version: 4, status: "DONE" });
    status = "DONE";
    await r.fulfill({
      json: {
        data: {
          id: "task-from-backend",
          version: 5,
          title: "来自后端的准备任务",
          status,
        },
      },
    });
  });
  await page.goto("/");
  const box = page.getByRole("checkbox", { name: "来自后端的准备任务" });
  await expect(box).toHaveAttribute("aria-checked", "false");
  await box.click();
  await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "1",
  );
});
