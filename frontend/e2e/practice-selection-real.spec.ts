import { test, expect } from "@playwright/test";

// Browser-only API fixtures: no accounts or records are created in the real backend.
const now = "2026-10-30T03:00:00Z";
const questions = [
  { id: "question-backend", title: "如何避免重复提交？", role: "backend", difficulty: "MEDIUM", tags: ["幂等"], promptMd: "请说明幂等设计。", answerMd: "唯一约束与幂等键", status: "PUBLISHED", version: 1, companyIds: [], chapterId: null, createdAt: now, updatedAt: now },
  { id: "question-frontend", title: "如何管理组件状态？", role: "frontend", difficulty: "EASY", tags: ["React"], promptMd: "请说明状态管理。", answerMd: "状态归属", status: "PUBLISHED", version: 1, companyIds: [], chapterId: null, createdAt: now, updatedAt: now },
  { id: "question-backend-cache", title: "缓存失效如何处理？", role: "backend", difficulty: "EASY", tags: ["缓存"], promptMd: "说明缓存失效。", answerMd: "缓存更新", status: "PUBLISHED", version: 1, companyIds: [], chapterId: null, createdAt: now, updatedAt: now },
  { id: "question-frontend-react", title: "如何避免重复渲染？", role: "frontend", difficulty: "MEDIUM", tags: ["React"], promptMd: "说明渲染优化。", answerMd: "状态归属", status: "PUBLISHED", version: 1, companyIds: [], chapterId: null, createdAt: now, updatedAt: now },
  { id: "question-frontend-performance", title: "如何分析长任务？", role: "frontend", difficulty: "HARD", tags: ["性能"], promptMd: "说明性能分析。", answerMd: "任务拆分", status: "PUBLISHED", version: 1, companyIds: [], chapterId: null, createdAt: now, updatedAt: now },
];
test("a question bank creates a practice in one click and still permits manual adjustments", async ({ page }) => {
  let session: Record<string, any> | null = null;
  let createBody: any;
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/v1/me") return route.fulfill({ json: { data: { id: "fixture-user", displayName: "验收用户", role: "USER", status: "ACTIVE", emailVerified: true, preferences: { roles: [], cities: [], recruitmentTypes: [] } } } });
    if (path.endsWith("/auth/csrf")) return route.fulfill({ json: { data: { token: "fixture-csrf" } } });
    if (path === "/api/v1/questions") return route.fulfill({ json: { data: questions } });
    if (path === "/api/v1/mock-sessions" && method === "POST") {
      createBody = route.request().postDataJSON();
      session = { id: "practice-fixture", version: 1, createdAt: now, updatedAt: now, role: createBody.role, companyId: null, questionIds: createBody.questionIds, durationSeconds: createBody.durationSeconds, state: "ACTIVE", remainingSeconds: 1800, report: null, answers: [{ id: "answer-fixture", version: 1, createdAt: now, updatedAt: now, questionId: questions[0].id, sequence: 1, promptSnapshot: questions[0].promptMd, referenceSnapshot: questions[0].answerMd, answerText: "", selfScore: null }] };
      return route.fulfill({ json: { data: session } });
    }
    if (path === "/api/v1/mock-sessions/practice-fixture/answers/answer-fixture" && method === "PUT") {
      const body = route.request().postDataJSON();
      session!.answers[0] = { ...session!.answers[0], ...body, version: 2 };
      return route.fulfill({ json: { data: session!.answers[0] } });
    }
    if (path === "/api/v1/mock-sessions/practice-fixture") return route.fulfill({ json: { data: session } });
    return route.fulfill({ json: { data: session ? [session] : [], page: { hasMore: false } } });
  });
  await page.goto("/mock");
  await page.getByRole("button", { name: /前端开发题库/ }).click();
  await expect(page.getByRole("button", { name: "开始练习（3 题）" })).toBeEnabled();
  for (const difficulty of ["基础", "进阶", "挑战"]) await expect(page.locator(".practice-composition")).toContainText(difficulty);
  await page.getByLabel("知识点", {exact:true}).selectOption("性能");
  await expect(page.getByRole("button", { name: "开始练习（1 题）" })).toBeEnabled();
  await page.getByLabel("知识点", {exact:true}).selectOption("");
  await expect(page.getByRole("button", { name: "开始练习（3 题）" })).toBeEnabled();
  await page.getByRole("button", { name: /后端开发题库/ }).click();
  await expect(page.getByRole("button", { name: "开始练习（2 题）" })).toBeEnabled();
  await page.getByText("查看题目并调整", { exact: false }).click();
  await page.getByRole("checkbox", {name:/缓存失效如何处理/}).uncheck();
  const backend = page.getByRole("checkbox", { name: /如何避免重复提交/ });
  await expect(backend).toBeChecked();
  await backend.uncheck();
  await expect(page.getByRole("button", { name: "开始练习（0 题）" })).toBeDisabled();
  await backend.check();
  await page.screenshot({path:test.info().outputPath("practice-selected.png")});
  await page.getByRole("button", { name: "开始练习（1 题）" }).click();
  await expect(page.getByLabel("我的回答", { exact: true })).toBeEditable();
  expect(createBody).toEqual({ role: "backend", questionIds: ["question-backend"], durationSeconds: 1800 });
  await page.getByLabel("我的回答", { exact: true }).fill("通过唯一约束与幂等键避免重复处理。");
  await page.getByRole("button", { name: "保存本题回答" }).click();
  await expect(page.getByText("回答已保存。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("我的回答", { exact: true })).toHaveValue("通过唯一约束与幂等键避免重复处理。");
  await page.screenshot({path:test.info().outputPath("practice-answer-restored.png")});
});

test("experience rounds use readable choices and preserve older round values", async ({ page }) => {
  const saved: any[] = [];
  let legacyRound = "TECHNICAL";
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === "/api/v1/me") return route.fulfill({ json: { data: { id: "fixture-user", displayName: "验收用户", role: "USER", status: "ACTIVE", emailVerified: true, preferences: { roles: [], cities: [], recruitmentTypes: [] } } } });
    if (path.endsWith("/auth/csrf")) return route.fulfill({ json: { data: { token: "fixture-csrf" } } });
    if (path === "/api/v1/experiences" && method === "POST" || path === "/api/v1/experiences/legacy" && method === "PATCH") {
      saved.push(route.request().postDataJSON());
      return route.fulfill({ json: { data: { id: "fixture-draft" } } });
    }
    if (path === "/api/v1/experiences/legacy") return route.fulfill({ json: { data: { id: "legacy", authorId: "fixture-user", version: 1, title: "既有面经", role: "backend", roundType: legacyRound, summary: "旧摘要", bodyMd: "旧正文", companyId: null, occurredOn: null, tags: [], status: "DRAFT" } } });
    return route.fulfill({ json: { data: [], page: { page: 1, size: 20, total: 0, hasMore: false } } });
  });
  await page.goto("/experiences");
  await page.getByRole("button", { name: "写面经", exact: true }).click();
  let dialog = page.getByRole("dialog");
  const round = dialog.getByRole("combobox", { name: "面试轮次", exact: true });
  await expect(round).toHaveValue("");
  await expect(round.locator("option")).toContainText(["请选择面试轮次", "一面", "二面", "HR 面"]);
  await dialog.getByLabel("标题", { exact: true }).fill("HR 面经历");
  await dialog.getByLabel("方向", { exact: true }).fill("backend");
  await round.selectOption({ label: "HR 面" });
  await dialog.getByLabel("摘要", { exact: true }).fill("经历摘要");
  await dialog.getByLabel("正文", { exact: true }).fill("经历正文");
  await page.screenshot({path:test.info().outputPath("experience-chinese-round.png")});
  await dialog.getByRole("button", { name: "保存草稿" }).click();
  await expect(dialog).toBeHidden();
  expect(saved[0].roundType).toBe("HR");
  for (const previous of ["TECHNICAL", "自定义第三轮"]) {
    legacyRound = previous;
    await page.goto("/experiences/legacy");
    await page.getByRole("button", { name: "编辑草稿", exact: true }).click();
    dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("combobox", { name: "面试轮次", exact: true })).toHaveValue(previous);
    if (previous === "TECHNICAL") await expect(dialog.locator("select option:checked").last()).toHaveText("技术面");
    await dialog.getByRole("button", { name: "保存草稿" }).click();
    await expect(dialog).toBeHidden();
    expect(saved.at(-1).roundType).toBe(previous);
  }
});
