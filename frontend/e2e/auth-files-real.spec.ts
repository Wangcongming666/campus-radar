import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { api, createLiveAccount } from "./helpers/live";

test.skip(process.env.API_REAL_E2E !== "1", "Requires real API and isolated MySQL");

async function data(request: APIRequestContext, path: string, method = "GET", body?: unknown, status = 200, key?: string): Promise<any> {
  const response = await api(request, path, method, body, key);
  expect(response.status(), `${method} ${path}`).toBe(status);
  if (status === 204) return undefined;
  const envelope = await response.json();
  expect(status >= 400 ? envelope.error?.requestId : envelope.requestId).toBeTruthy();
  return status >= 400 ? envelope.error : envelope.data;
}

test("directly registered accounts keep original file bytes and resume mutations private and versioned", async ({ browser }) => {
  const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5179";
  const owner = await browser.newContext({ baseURL }), peer = await browser.newContext({ baseURL });
  try {
    const account = await createLiveAccount(owner.request, "files-owner");
    await createLiveAccount(peer.request, "files-peer");
    const profile = await data(owner.request, "/me");
    expect(profile.id).toBe(account.userId);expect(profile.emailVerified).toBe(false);
    for (const privateKey of ["email", "passwordHash", "authVersion", "dataOperation"]) expect(profile).not.toHaveProperty(privateKey);
    await data(owner.request, "/me", "PATCH", { version: profile.version + .5, displayName: "不可写入" }, 422);
    const unsafe = await owner.request.patch("/api/v1/me", { data: { version: profile.version, displayName: "不可写入" } });
    expect(unsafe.status()).toBe(403);
    const csrf = await data(owner.request, "/auth/csrf");
    const original = Buffer.from("教育背景\n项目经历：真实字节\n技能 Java SQL\n", "utf8"), key = randomUUID();
    async function upload(bytes: Buffer, idempotencyKey = key) {
      return owner.request.post("/api/v1/files?purpose=RESUME", { headers: { Origin: baseURL, "X-CSRF-TOKEN": csrf.token, "Idempotency-Key": idempotencyKey }, multipart: { file: { name: "真实简历.txt", mimeType: "text/plain", buffer: bytes } } });
    }
    const uploaded = await upload(original);expect(uploaded.status()).toBe(201);const file = (await uploaded.json()).data;
    expect(file.sha256).toBe(createHash("sha256").update(original).digest("hex"));expect(file).not.toHaveProperty("storageKey");
    const replay = await upload(original);expect(replay.status()).toBe(201);expect((await replay.json()).data.id).toBe(file.id);
    expect((await upload(Buffer.from("different bytes"))).status()).toBe(409);
    const download = await owner.request.get(`/api/v1/files/${file.id}/download`);expect(download.status()).toBe(200);
    expect(await download.body()).toEqual(original);expect(download.headers()["x-content-sha256"]).toBe(file.sha256);
    expect((await peer.request.get(`/api/v1/files/${file.id}/download`)).status()).toBe(404);
    const resumeInput = { name: "真实版本一", fileId: file.id, text: original.toString(), extractionState: "TEXT_READY" };
    const first = await data(owner.request, "/resumes", "POST", resumeInput, 201, randomUUID());
    const second = await data(owner.request, "/resumes", "POST", { ...resumeInput, name: "真实版本二" }, 201, randomUUID());
    expect(first.isDefault).toBe(true);expect(second.isDefault).toBe(false);expect(second.sequence).toBe(first.sequence + 1);
    await data(peer.request, `/resumes/${first.id}`, "PATCH", { version: first.version, name: "越权" }, 404);
    await data(owner.request, `/files/${file.id}?version=${file.version}`, "DELETE", undefined, 409);
    const changed = await data(owner.request, `/resumes/${second.id}`, "PATCH", { version: second.version, isDefault: true });
    await data(owner.request, `/resumes/${second.id}`, "PATCH", { version: second.version, name: "过时" }, 409);
    const resumes = await data(owner.request, "/resumes");expect(resumes.filter((row: any) => row.isDefault)).toHaveLength(1);
    const firstNow = resumes.find((row: any) => row.id === first.id);
    await data(owner.request, `/resumes/${first.id}?version=${firstNow.version}`, "DELETE", undefined, 204);
    await data(owner.request, `/resumes/${second.id}?version=${changed.version}`, "DELETE", undefined, 204);
    await data(owner.request, `/files/${file.id}?version=${file.version}`, "DELETE", undefined, 204);
    expect((await owner.request.get(`/api/v1/files/${file.id}/download`)).status()).toBe(404);
    await expect.poll(async () => (await data(owner.request, "/files")).some((row: any) => row.id === file.id), { timeout: 20000 }).toBe(false);
  } finally { await owner.close();await peer.close(); }
});

test("admin creates and edits every content type, reviews full detail, and controls public publication", async ({ browser }) => {
  test.setTimeout(120000);
  const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5179";
  const admin = await browser.newContext({ baseURL }), publicContext = await browser.newContext({ baseURL });
  try {
    const account = await createLiveAccount(admin.request, "admin-content");
    await data(admin.request, "/admin/sources", "GET", undefined, 403);
    execFileSync("bash", ["../scripts/promote-admin.sh", account.email], { stdio: "pipe", env: process.env });
    await data(admin.request, "/auth/login", "POST", { email: account.email, password: account.password });
    const suffix = randomUUID().slice(0, 8);
    const source = await data(admin.request, "/admin/sources", "POST", { name: `真实来源 ${suffix}`, baseUrl: "https://example.com/jobs", contentMode: "METADATA_LINK", permissionNote: "仅本地验收人工录入", enabled: true }, 201, randomUUID());
    const company = await data(admin.request, "/admin/companies", "POST", { slug: `real-${suffix}`, name: `真实公司 ${suffix}`, logoUrl: null, industry: "软件", sizeBand: null, cities: ["上海"], tags: ["验收"], descriptionMd: "真实人工录入公司" }, 201, randomUUID());
    expect((await data(admin.request, `/admin/companies/${company.id}`, "PATCH", { version: company.version, descriptionMd: "修订后的公司介绍" })).descriptionMd).toBe("修订后的公司介绍");
    const chapter = await data(admin.request, "/admin/chapters", "POST", { parentId: null, slug: `real-${suffix}`, title: `真实章节 ${suffix}`, direction: "后端", sortOrder: 0, bodyMd: "正文审核测试" }, 201, randomUUID());
    const question = await data(admin.request, "/admin/questions", "POST", { title: `真实题目 ${suffix}`, promptMd: "事务隔离级别是什么？", answerMd: "不同隔离级别处理并发可见性。", role: "后端", difficulty: "MEDIUM", tags: ["SQL"], companyIds: [company.id], chapterId: chapter.id }, 201, randomUUID());
    const signal = await data(admin.request, "/admin/signals", "POST", { companyId: company.id, title: `真实信号 ${suffix}`, body: "人工核查信息", kind: "NOTICE", sourceUrl: "https://example.com/notice", occurredAt: new Date().toISOString() }, 201, randomUUID());
    const job = await data(admin.request, "/admin/jobs", "POST", { companyId: company.id, title: `真实岗位 ${suffix}`, role: "后端", cities: ["上海"], education: "BACHELOR", recruitmentType: "CAMPUS", graduationYears: [2027], skills: ["Java"], salary: null, descriptionMd: "仅供真实联调", canonicalUrl: `https://example.com/job/${suffix}`, deadlineAt: null, deadlineDate: null, deadlinePrecision: "UNKNOWN", sourceTimezone: "Asia/Shanghai", status: "OPEN", sourceId: source.id }, 201, randomUUID());
    await data(publicContext.request, `/jobs/${job.id}`, "GET", undefined, 404);
    await data(publicContext.request, `/questions/${question.id}`, "GET", undefined, 404);
    for (const [kind, type, row, patch] of [
      ["jobs", "JOB", job, { title: `修订岗位 ${suffix}` }], ["chapters", "CHAPTER", chapter, { bodyMd: "修订后的章节正文" }],
      ["questions", "QUESTION", question, { answerMd: "修订后的题目答案" }], ["signals", "SIGNAL", signal, { body: "修订后的信号正文" }],
    ] as const) {
      const changed = await data(admin.request, `/admin/${kind}/${row.id}`, "PATCH", { version: row.version, ...patch });
      await data(admin.request, `/admin/${kind}/${row.id}`, "PATCH", { version: row.version, ...patch }, 409);
      const detail = await data(admin.request, `/admin/moderation/${type}/${row.id}`);
      expect(detail.item.version).toBe(changed.version);expect(detail.content.id).toBe(row.id);
      expect(JSON.stringify(detail)).not.toMatch(/passwordHash|storageKey|emailMasked/);
      await data(admin.request, `/admin/moderation/${type}/${row.id}/decisions`, "POST", { version: detail.item.version, decision: "APPROVE", reason: "真实联调已核对全文" }, 200, randomUUID());
    }
    expect((await data(publicContext.request, `/jobs/${job.id}`)).title).toBe(`修订岗位 ${suffix}`);
    expect((await data(publicContext.request, `/questions/${question.id}`)).answerMd).toBe("修订后的题目答案");
    expect((await data(publicContext.request, `/handbook/chapters/${chapter.slug}`)).bodyMd).toBe("修订后的章节正文");
    const currentSource = await data(admin.request, `/admin/sources/${source.id}`, "PATCH", { version: source.version, enabled: false });expect(currentSource.enabled).toBe(false);
    await data(publicContext.request, `/jobs/${job.id}`, "GET", undefined, 404);
    expect((await data(admin.request, "/admin/audit-logs")).length).toBeGreaterThan(0);
  } finally { await admin.close();await publicContext.close(); }
});
