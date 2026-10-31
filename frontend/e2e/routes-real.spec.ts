import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { api, createLiveAccount, ensureLiveCatalog } from "./helpers/live";

test.skip(process.env.API_REAL_E2E !== "1", "Requires real API, local Mailpit and isolated MySQL");

type RouteCheck = { path: string; title: string | RegExp; endpoint?: string; text?: string };
async function data(request: APIRequestContext, path: string, method = "GET", body?: unknown, status = 200) {
  const response = await api(request, path, method, body, method === "POST" ? randomUUID() : undefined);
  expect(response.status(), `${method} ${path}`).toBe(status);
  return (await response.json()).data;
}
async function inspect(page: Page, route: RouteCheck) {
  const response = route.endpoint ? page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1${route.endpoint}` && response.request().method() === "GET") : null;
  await page.goto(route.path);
  if (response) expect((await response).status(), route.endpoint).toBe(200);
  await expect(page.getByRole("heading", { name: route.title, exact: true }).first()).toBeVisible();
  if (route.text) await expect(page.getByText(route.text, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /正在(加载|恢复|打开|读取)/ })).toHaveCount(0);
  await expect(page.getByRole("alert"), `${route.path} must not hide a service or rendering error`).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /页面不存在|页面暂时无法打开/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `${route.path} horizontal overflow`).toBe(true);
}

for (const width of [1440, 390]) {
  test(`all 39 real routes render data, forms and access boundaries at ${width}px`, async ({ browser }) => {
    test.setTimeout(240000);
    const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5179";
    const publicContext = await browser.newContext({ baseURL, viewport: { width, height: 1000 } });
    const memberContext = await browser.newContext({ baseURL, viewport: { width, height: 1000 } });
    const adminContext = await browser.newContext({ baseURL, viewport: { width, height: 1000 } });
    const pageErrors: string[] = [], failedResponses: string[] = [];
    try {
      const catalog = await ensureLiveCatalog(memberContext.request);
      await createLiveAccount(memberContext.request, `routes-${width}`);
      await data(adminContext.request, "/auth/login", "POST", { email: catalog.admin.email, password: catalog.admin.password });
      const company = await data(memberContext.request, `/companies/${catalog.companyId}`);
      const application = await data(memberContext.request, "/applications", "POST", { jobId: catalog.jobId });
      await data(memberContext.request, `/applications/${application.application.id}/rounds`, "POST", { title: "路由验收技术面", roundType: "TECHNICAL", sequence: 1, mode: "ONLINE", status: "SCHEDULED", startsAt: null, endsAt: null, timezone: "Asia/Shanghai", location: null, meetingUrl: null }, 201);
      let experience = await data(memberContext.request, "/experiences", "POST", { title: `路由验收面经 ${width}`, summary: "真实接口录入的隔离验收内容", bodyMd: "原创面试记录：先描述项目，再讨论并发更新。", role: "backend", roundType: "TECHNICAL", occurredOn: null, tags: ["路由验收"], companyId: catalog.companyId }, 201);
      experience = await data(memberContext.request, `/experiences/${experience.id}/submit`, "POST", { version: experience.version });
      await data(adminContext.request, `/admin/moderation/EXPERIENCE/${experience.id}/decisions`, "POST", { version: experience.version, decision: "APPROVE", reason: "隔离数据库浏览器路由验收" });
      const monitor = (page: Page) => {
        page.on("pageerror", error => pageErrors.push(error.message));
        page.on("response", response => { if (response.url().includes("/api/v1/") && response.status() >= 500) failedResponses.push(`${response.status()} ${response.url()}`); });
      };
      const publicPage = await publicContext.newPage(), memberPage = await memberContext.newPage(), adminPage = await adminContext.newPage();
      [publicPage, memberPage, adminPage].forEach(page => { page.setDefaultTimeout(15000); monitor(page); });
      const publicRoutes: RouteCheck[] = [
        { path: "/", title: /让每一次投递，\s*都有方向。/, endpoint: "/public/stats" },
        { path: "/login", title: "欢迎回来" },
        { path: "/register", title: "从这里，开启新的可能" },
        { path: "/forgot-password", title: "找回你的账号" },
        { path: "/reset-password", title: "设置新的密码" },
        { path: "/jobs?city=验收城市", title: "岗位广场", endpoint: "/jobs", text: "联调测试岗位" },
        { path: `/jobs/${catalog.jobId}`, title: "联调测试岗位", endpoint: `/jobs/${catalog.jobId}`, text: "仅供联调的岗位描述" },
        { path: `/company/${catalog.companyId}`, title: company.name, endpoint: `/companies/${catalog.companyId}` },
        { path: "/experiences", title: "面经广场", endpoint: "/experiences", text: `路由验收面经 ${width}` },
        { path: `/experiences/${experience.id}`, title: `路由验收面经 ${width}`, endpoint: `/experiences/${experience.id}`, text: "原创面试记录：先描述项目，再讨论并发更新。" },
        { path: "/questions", title: "题库练习", endpoint: "/questions", text: "如何处理并发更新？" },
        { path: "/handbook", title: "求职宝典", endpoint: "/handbook/chapters", text: "事务与并发" },
        { path: `/pack/${company.slug}`, title: "公司准备包", endpoint: `/companies/by-slug/${company.slug}/pack` },
        { path: `/style/${company.slug}`, title: "面试风格统计", endpoint: `/companies/by-slug/${company.slug}/style` },
        { path: "/salary", title: "薪资参考", endpoint: "/salary/summary" },
        { path: "/community", title: "校招社区", endpoint: "/posts" },
        { path: "/radar", title: "校招雷达", endpoint: "/radar/signals" },
        { path: "/referral", title: "内推资源", endpoint: "/referrals" },
      ];
      for (const route of publicRoutes) await test.step(route.path, () => inspect(publicPage, route));
      const memberRoutes: RouteCheck[] = [
        { path: "/onboarding", title: "认识你的求职目标", endpoint: "/me" },
        { path: "/pipeline", title: "投递看板", endpoint: "/applications/board", text: "联调测试岗位" },
        { path: "/calendar", title: "面试日历", endpoint: "/calendar/events" },
        { path: "/analytics", title: "投递分析", endpoint: "/analytics" },
        { path: "/resumes", title: "简历版本库", endpoint: "/resumes" },
        { path: `/interview/${application.application.id}/timeline`, title: "面试时间线", endpoint: `/applications/${application.application.id}/rounds`, text: "1. 路由验收技术面" },
        { path: `/interview/${application.application.id}/review`, title: "面试复盘", endpoint: `/applications/${application.application.id}/rounds` },
        { path: "/mock", title: "模拟练习", endpoint: "/mock-sessions" },
        { path: "/resume-check", title: "简历规则检查", endpoint: "/resumes" },
        { path: "/planner", title: "成长计划", endpoint: "/planner/tasks" },
        { path: "/offer-compare", title: "Offer 决策", endpoint: "/offers" },
        { path: "/buddy", title: "同路人", endpoint: "/buddy/rooms" },
        { path: "/subscriptions", title: "岗位订阅", endpoint: "/subscriptions" },
        { path: "/me", title: "我的求职概览", endpoint: "/me/overview" },
        { path: "/favorites", title: "我的收藏", endpoint: "/favorites" },
        { path: "/notifications", title: "通知中心", endpoint: "/notifications" },
        { path: "/settings", title: "偏好设置", endpoint: "/me" },
      ];
      for (const route of memberRoutes) await test.step(route.path, () => inspect(memberPage, route));
      for (const route of [
        { path: "/admin", title: "内容管理", endpoint: "/admin/moderation" },
        { path: "/admin/services", title: "服务管理", endpoint: "/admin/services" },
      ]) await test.step(route.path, () => inspect(adminPage, route));
      // Access checks use the actual session boundary rather than substituted API errors.
      await publicPage.goto("/pipeline");
      await expect(publicPage).toHaveURL(/\/login\?returnTo=%2Fpipeline/);
      await memberPage.goto("/admin");
      await expect(memberPage.getByRole("alert")).toHaveText("此页面需要内容管理权限。");
      if (width === 390) {
        await memberPage.goto("/jobs");
        await memberPage.getByRole("button", { name: "打开导航", exact: true }).click();
        await expect(memberPage.getByRole("navigation", { name: "主导航" })).toBeVisible();
        await memberPage.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "投递看板", exact: true }).click();
        await expect(memberPage.getByRole("heading", { name: "投递看板", exact: true })).toBeVisible();
      }
      await memberPage.goto("/jobs");
      const before = await memberPage.locator("html").getAttribute("data-theme");
      await memberPage.getByRole("button", { name: "切换主题", exact: true }).click();
      await expect(memberPage.locator("html")).not.toHaveAttribute("data-theme", before ?? "");
      expect(pageErrors).toEqual([]); expect(failedResponses).toEqual([]);
      expect(publicRoutes.length + memberRoutes.length + 2).toBe(39);
      await memberPage.screenshot({ path: `qa/routes-real-${width}.png`, fullPage: true, animations: "disabled" });
    } finally { await publicContext.close(); await memberContext.close(); await adminContext.close(); }
  });
}
