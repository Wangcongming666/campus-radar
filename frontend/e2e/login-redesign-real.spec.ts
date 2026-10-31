import { test, expect, type Page } from "@playwright/test";
const user = {
  id: "test-user",
  version: 1,
  displayName: "登录验收",
  role: "USER",
  theme: "LIGHT",
  timezone: "Asia/Shanghai",
  emailMasked: "t***@example.test",
  emailVerified: false,
  preferences: { roles: [], cities: [], recruitmentTypes: [] },
};
async function mockAccount(page: Page) {
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({ json: { data: user } }),
  );
  await page.route("**/api/v1/me/overview", (route) =>
    route.fulfill({
      json: {
        data: {
          applications: 0,
          interviews: 0,
          offers: 0,
          favorites: 0,
          unreadNotifications: 0,
          recentEvents: [],
        },
      },
    }),
  );
  await page.route("**/api/v1/auth/csrf", (route) =>
    route.fulfill({ json: { data: { token: "test-csrf-token" } } }),
  );
  await page.route("**/api/v1/jobs?*", (route) =>
    route.fulfill({
      json: { data: [], page: { page: 1, size: 20, total: 0, hasMore: false } },
    }),
  );
  await page.route("**/api/v1/favorites?*", (route) =>
    route.fulfill({
      json: {
        data: [],
        page: { page: 1, size: 100, total: 0, hasMore: false },
      },
    }),
  );
  await page.route("**/api/v1/applications?*", (route) =>
    route.fulfill({
      json: {
        data: [],
        page: { page: 1, size: 100, total: 0, hasMore: false },
      },
    }),
  );
}
async function brightness(page: Page) {
  return page.locator(".login-visual canvas").evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const context = element.getContext("2d")!;
    const pixels = context.getImageData(
      element.width * 0.25,
      element.height * 0.2,
      element.width * 0.5,
      element.height * 0.35,
    ).data;
    let total = 0;
    for (let i = 3; i < pixels.length; i += 4) total += pixels[i];
    return total;
  });
}
test("credential focus drives canvas brightness and restores the default on blur", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockAccount(page);
  await page.goto("/login");
  await expect(page.locator(".login-visual")).toHaveAttribute(
    "data-radar-state",
    "idle",
  );
  await expect.poll(() => brightness(page)).toBeGreaterThan(0);
  const idle = await brightness(page);
  await page.getByRole("textbox", { name: "邮箱", exact: true }).focus();
  await expect(page.locator(".login-visual h2")).toContainText("你的专属雷达");
  await expect.poll(() => brightness(page)).toBeGreaterThan(idle * 1.4);
  await expect(page.locator(".login-input-shell").first()).toHaveCSS(
    "border-color",
    "rgb(37, 99, 235)",
  );
  await page.getByLabel("密码", { exact: true }).focus();
  await expect(page.locator(".login-visual")).toHaveAttribute(
    "data-radar-state",
    "connected",
  );
  await page.getByRole("link", { name: "忘记密码？" }).focus();
  await expect(page.locator(".login-visual h2")).toContainText("让每一次投递");
  await expect.poll(() => brightness(page)).toBeLessThan(idle * 1.05);
});
test("login posts the existing contract, shows loading and remembers only email", async ({
  page,
}) => {
  await mockAccount(page);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/auth/login", async (route) => {
    await wait;
    await route.fulfill({ json: { data: user } });
  });
  await page.goto("/login?returnTo=%2Fjobs%3Frole%3Dfrontend");
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("login-test@example.test");
  await page
    .getByLabel("密码", { exact: true })
    .fill("Example-password-only-for-test");
  await page.getByLabel("记住邮箱").check();
  const request = page.waitForRequest(
    (req) => req.url().endsWith("/auth/login") && req.method() === "POST",
  );
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const sent = await request;
  expect(sent.postDataJSON()).toEqual({
    email: "login-test@example.test",
    password: "Example-password-only-for-test",
  });
  expect(sent.headers()["x-csrf-token"]).toBe("test-csrf-token");
  await expect(
    page.getByRole("button", { name: "验证中...", exact: true }),
  ).toBeDisabled();
  release();
  await expect(page).toHaveURL(/\/jobs\?role=frontend$/);
  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).toContain("login-test@example.test");
  expect(stored).not.toContain("Example-password");
  await page.goto("/login");
  await expect(
    page.getByRole("textbox", { name: "邮箱", exact: true }),
  ).toHaveValue("login-test@example.test");
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
});
test("errors preserve the form, reveal password and allow retry", async ({
  page,
}) => {
  await mockAccount(page);
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({
      status: 401,
      json: {
        error: { code: "INVALID_CREDENTIALS", message: "邮箱或密码不正确。" },
      },
    }),
  );
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("login-test@example.test");
  const password = page.getByLabel("密码", { exact: true });
  await password.fill("Incorrect-password");
  await page.getByRole("button", { name: "显示密码", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("邮箱或密码不正确");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeEnabled();
  await expect(password).toHaveValue("Incorrect-password");
  await expect(
    page.getByRole("button", { name: "GitHub 登录暂未开通" }),
  ).toBeDisabled();
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 720 },
  { width: 390, height: 844 },
  { width: 360, height: 640 },
]) {
  test(`${viewport.width}x${viewport.height}: responsive login is reachable without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockAccount(page);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "登录", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /还没收到验证邮件/ }),
    ).toHaveCount(0);
    if (viewport.width < 900) {
      await expect(page.locator(".login-visual")).toBeHidden();
      await expect(page.locator(".login-mobile-brand")).toBeVisible();
    } else {
      const box = await page.locator(".login-visual").boundingBox();
      expect(box!.width).toBeCloseTo(viewport.width * 0.55, 0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    expect(errors).toEqual([]);
  });
}
test("unsafe returnTo remains inside the application", async ({ page }) => {
  await mockAccount(page);
  await page.route("**/api/v1/auth/login", (route) =>
    route.fulfill({ json: { data: user } }),
  );
  await page.goto("/login?returnTo=https%3A%2F%2Fexample.test");
  await page
    .getByRole("textbox", { name: "邮箱", exact: true })
    .fill("login-test@example.test");
  await page.getByLabel("密码", { exact: true }).fill("Test-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/me$/);
});

test("canvas renders changing frames and returns its title within half a second", async ({
  page,
}) => {
  await mockAccount(page);
  await page.goto("/login");
  const canvas = page.locator(".login-visual canvas");
  const first = await canvas.evaluate((node) =>
    (node as HTMLCanvasElement).toDataURL(),
  );
  await expect
    .poll(
      () => canvas.evaluate((node) => (node as HTMLCanvasElement).toDataURL()),
      { timeout: 1500 },
    )
    .not.toBe(first);
  await page.getByRole("textbox", { name: "邮箱", exact: true }).focus();
  await expect(page.locator(".login-visual h2")).toContainText("你的专属雷达");
  await page.getByRole("link", { name: "忘记密码？" }).focus();
  await expect(page.locator(".login-visual h2")).toContainText("让每一次投递", {
    timeout: 500,
  });
});
