import { test, expect, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { api, createLiveAccount, ensureLiveCatalog } from "./helpers/live";

// No route substitutes: the scheduler, worker, MySQL and browser share the running test environment.
test.skip(process.env.API_REAL_E2E !== "1", "Requires real API, isolated MySQL, RabbitMQ worker and Mailpit");
test.describe.configure({ mode: "serial" });
type Row = Record<string, any>;
let owner: BrowserContext, catalog: Awaited<ReturnType<typeof ensureLiveCatalog>>;
async function data(request: APIRequestContext, path: string, method = "GET", body?: unknown, status = 200): Promise<any> {
  const response = await api(request, path, method, body, method === "POST" ? crypto.randomUUID() : undefined);
  expect(response.status(), `${method} ${path}`).toBe(status);
  if (status === 204) return undefined;
  return (await response.json()).data;
}
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120000);
  owner = await browser.newContext({ baseURL: process.env.PREVIEW_URL ?? "http://127.0.0.1:5179" });
  await createLiveAccount(owner.request, "scheduled-owner");
  catalog = await ensureLiveCatalog(owner.request);
});
test.afterAll(async () => { await owner?.close(); });

test("scheduled planner and calendar reminders persist, skip final states and do not return after deletion", async () => {
  test.setTimeout(180000);
  const dueAt = new Date(Date.now() + 15000).toISOString();
  const task = { title: "自动规划到期提醒", status: "TODO", dueAt, notes: "真实定时器验收", milestone: "", sortOrder: 0 };
  await data(owner.request, "/planner/tasks", "POST", task, 201);
  await data(owner.request, "/planner/tasks", "POST", { ...task, title: "已完成不应提醒", status: "DONE" }, 201);
  const calendar = { title: "自动日程开始提醒", applicationId: null, roundId: null, startsAt: dueAt, endsAt: new Date(Date.parse(dueAt) + 1800000).toISOString(), timezone: "Asia/Shanghai", kind: "INTERVIEW", location: null, meetingUrl: null, notes: "真实定时器验收", status: "SCHEDULED" };
  await data(owner.request, "/calendar/events", "POST", calendar, 201);
  await data(owner.request, "/calendar/events", "POST", { ...calendar, title: "已取消不应提醒", status: "CANCELLED" }, 201);
  await expect.poll(async () => (await data(owner.request, "/notifications?size=100")).length, { timeout: 90000 }).toBe(2);
  const notices: Row[] = await data(owner.request, "/notifications?size=100");
  expect(notices.map(row => row.type).sort()).toEqual(["INTERVIEW", "PLANNER"]);
  expect(notices.map(row => row.targetPath).sort()).toEqual(["/calendar", "/planner"]);
  expect(notices.every(row => !row.title.includes("不应提醒"))).toBe(true);
  const plannerNotice = notices.find(row => row.type === "PLANNER")!;
  await data(owner.request, `/notifications/${plannerNotice.id}?version=${plannerNotice.version}`, "DELETE", undefined, 204);
  // A second marker proves another real scheduler sweep has run after deletion.
  await data(owner.request, "/planner/tasks", "POST", { ...task, title: "下一次轮询验收标记" }, 201);
  await expect.poll(async () => (await data(owner.request, "/notifications?size=100")).some((row: Row) => row.title.includes("下一次轮询验收标记")), { timeout: 90000 }).toBe(true);
  const after: Row[] = await data(owner.request, "/notifications?size=100");
  expect(after.some(row => row.title.includes("自动规划到期提醒"))).toBe(false);
  expect(after).toHaveLength(2);
  const page = await owner.newPage();
  await page.goto("/notifications"); await expect(page.getByText("日程提醒 · 自动日程开始提醒", { exact: true })).toBeVisible();
  await page.close();
});

test("enabled subscriptions discover jobs through the timer without requesting a manual scan", async () => {
  test.setTimeout(120000);
  const subscription = await data(owner.request, "/subscriptions", "POST", { name: "无需点击扫描的真实订阅", conditions: { roles: [], cities: [], recruitmentTypes: [], graduationYear: null }, inApp: true, email: false, enabled: true }, 201);
  const path = `/subscriptions/${subscription.id}/hits?size=100`;
  await expect.poll(async () => (await data(owner.request, path)).some((row: Row) => row.jobId === catalog.jobId), { timeout: 90000 }).toBe(true);
  const hits: Row[] = await data(owner.request, path);
  expect(new Set(hits.map(row => `${row.jobId}:${row.jobVersion}`)).size).toBe(hits.length);
  const notices: Row[] = await data(owner.request, "/notifications?size=100");
  expect(notices.filter(row => row.type === "JOB_HIT")).toHaveLength(hits.length);
  const page = await owner.newPage(); await page.goto("/subscriptions");
  await expect(page.getByText("无需点击扫描的真实订阅", { exact: true })).toBeVisible();
  await page.close();
});
