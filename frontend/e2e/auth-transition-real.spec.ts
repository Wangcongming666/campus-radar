import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page) {
  await page.route("**/api/v1/me", (r) =>
    r.fulfill({ status: 401, json: { error: { code: "UNAUTHENTICATED" } } }),
  );
  await page.route("**/api/v1/auth/csrf", (r) =>
    r.fulfill({ json: { data: { token: "auth-layout-test" } } }),
  );
}
const modeNav = (page: Page) =>
  page.getByRole("navigation", { name: "登录与注册切换" });
test("login and register share one canvas, preserve email and clear passwords", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/login?returnTo=%2Fpipeline");
  const initialTabs = await modeNav(page).boundingBox();
  const canvas = await page.locator(".login-visual canvas").elementHandle();
  if (!canvas) throw new Error("canvas missing");
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("kept@example.test");
  await page.getByLabel("密码", { exact: true }).fill("Not-kept-password");
  await modeNav(page).getByRole("link", { name: "注册", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "开启你的下一站。" }),
  ).toBeVisible();
  const registeredTabs = await modeNav(page).boundingBox();
  expect(initialTabs).not.toBeNull();
  expect(registeredTabs?.y).toBe(initialTabs?.y);
  expect(await canvas.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator(".login-visual")).toHaveAttribute(
    "data-visual-mode",
    "register",
  );
  await expect(
    page.getByRole("textbox", { name: "邮箱", exact: true }),
  ).toHaveValue("kept@example.test");
  await page
    .getByRole("textbox", { name: "昵称", exact: true })
    .fill("保留的昵称");
  await modeNav(page).getByRole("link", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
  expect(await canvas.evaluate((node) => node.isConnected)).toBe(true);
  await modeNav(page).getByRole("link", { name: "注册", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "昵称", exact: true }),
  ).toHaveValue("保留的昵称");
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
  await expect(page).toHaveURL(/\/register\?returnTo=%2Fpipeline$/);
});
test("rapid switches and browser back keep a single form and visual", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/login");
  await modeNav(page).getByRole("link", { name: "注册", exact: true }).click();
  await modeNav(page).getByRole("link", { name: "登录", exact: true }).click();
  await modeNav(page).getByRole("link", { name: "注册", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "创建账号", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".login-visual canvas")).toHaveCount(1);
  await expect(page.locator(".auth-route-form")).toHaveCount(1);
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
});
test("confirmation mismatch blocks registration without a request", async ({
  page,
}) => {
  await fixture(page);
  let submitted = 0;
  await page.route("**/api/v1/auth/register", (r) => {
    submitted++;
    return r.fulfill({ json: { data: { accepted: true } } });
  });
  await page.goto("/register");
  await fill(page, "A-long-password-1", "A-long-password-2");
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("两次输入的密码不一致");
  expect(submitted).toBe(0);
});
async function fill(
  page: Page,
  password = "A-long-password-1",
  confirmation = password,
) {
  await page
    .getByRole("textbox", { name: "昵称", exact: true })
    .fill("注册验收");
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("register@example.test");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码", { exact: true }).fill(confirmation);
}
test("registration submits real contract with CSRF and waits for backend acceptance", async ({
  page,
}) => {
  await fixture(page);
  let complete!: () => void;
  const gate = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let calls = 0;
  await page.route("**/api/v1/auth/register", async (r) => {
    calls++;
    expect(r.request().postDataJSON()).toEqual({
      email: "register@example.test",
      displayName: "注册验收",
      password: "A-long-password-1",
    });
    expect(r.request().headers()["x-csrf-token"]).toBe("auth-layout-test");
    await gate;
    await r.fulfill({
      status: 202,
      json: { data: { accepted: true, verificationRequired: false } },
    });
  });
  await page.goto("/register?returnTo=%2Fpipeline");
  await fill(page);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "正在创建账号", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("注册申请已受理", { exact: false })).toHaveCount(
    0,
  );
  complete();
  await expect(page.getByRole("status")).toContainText("注册完成");
  await expect(page.getByRole("status")).toContainText("register@example.test");
  await expect(page.getByRole("status")).toContainText("现在可以直接登录");
  await expect(page.getByRole("link", { name: /重新发送/ })).toHaveCount(0);
  expect(calls).toBe(1);
  await page.getByRole("link", { name: "前往登录", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "邮箱", exact: true }),
  ).toHaveValue("register@example.test");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fpipeline$/);
});
test("registration failure stays on form with draft and retry", async ({
  page,
}) => {
  await fixture(page);
  await page.route("**/api/v1/auth/register", (r) =>
    r.fulfill({
      status: 503,
      json: {
        error: {
          code: "UNAVAILABLE",
          message: "注册服务暂时不可用，请稍后重试。",
        },
      },
    }),
  );
  await page.goto("/register");
  await fill(page);
  await page.getByRole("button", { name: "创建账号", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("注册服务暂时不可用");
  await expect(
    page.getByRole("button", { name: "创建账号", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("textbox", { name: "昵称", exact: true }),
  ).toHaveValue("注册验收");
  await expect(page.getByRole("heading", { name: /账号已就绪/ })).toHaveCount(
    0,
  );
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 720 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
])
  test(`${viewport.width}x${viewport.height}: registration fields and navigation fit`, async ({
    page,
  }) => {
    await fixture(page);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/register");
    await expect(
      page.getByRole("textbox", { name: "昵称", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "创建账号", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("button", { name: "创建账号", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "直接登录", exact: false }),
    ).toBeVisible();
    if (viewport.width < 900)
      await expect(page.locator(".login-visual")).toBeHidden();
    else await expect(page.locator(".login-visual canvas")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });

for (const path of ["verify-email", "resend-verification"]) {
  test(`retired ${path} link goes to login without verification`, async ({
    page,
  }) => {
    await fixture(page);
    let verificationRequests = 0;
    await page.route("**/api/v1/auth/verify-email", (route) => {
      verificationRequests++;
      return route.abort();
    });
    await page.route("**/api/v1/auth/resend-verification", (route) => {
      verificationRequests++;
      return route.abort();
    });
    await page.goto(`/${path}#token=legacy-token-not-for-use`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole("button", { name: "登录", exact: true }),
    ).toBeVisible();
    expect(verificationRequests).toBe(0);
  });
}
