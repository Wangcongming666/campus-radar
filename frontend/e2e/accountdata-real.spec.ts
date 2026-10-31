import { test, expect, type APIRequestContext } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { api, createLiveAccount, ensureLiveCatalog } from "./helpers/live";

test.skip(process.env.API_REAL_E2E !== "1", "Requires real MySQL, Redis, RabbitMQ, Mailpit and isolated acceptance database");
type Value = Record<string, any>;
async function data(request: APIRequestContext, path: string, method = "GET", body?: unknown, status = 200, key?: string): Promise<any> {
  const response = await api(request, path, method, body, key ?? (method === "POST" || method === "DELETE" ? randomUUID() : undefined));
  expect(response.status(), `${method} ${path}`).toBe(status);
  if (status === 204) return undefined;
  const envelope = await response.json(); expect(status >= 400 ? envelope.error?.requestId : envelope.requestId).toBeTruthy();
  return status >= 400 ? envelope.error : envelope.data;
}
async function finished(request: APIRequestContext, id: string) {
  let result: Value = {};
  await expect.poll(async () => { result = await data(request, `/tasks/${id}`); return result.state; }, { timeout: 60000, intervals: [250, 500, 1000] }).toBe("SUCCEEDED");
  expect(result.progress).toBe(100); expect(result.errorCode).toBeNull(); return result;
}
async function upload(request: APIRequestContext, bytes: Buffer, purpose: "RESUME" | "BACKUP", name: string) {
  const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5179", baseAPI = process.env.API_URL ?? "http://127.0.0.1:8080";
  const csrf = await data(request, "/auth/csrf");
  const response = await request.post(`${baseAPI}/api/v1/files`, { headers: { Origin: baseURL, "X-CSRF-TOKEN": csrf.token, "Idempotency-Key": randomUUID() }, multipart: { purpose, file: { name, mimeType: purpose === "BACKUP" ? "application/zip" : "text/plain", buffer: bytes } } });
  expect(response.status()).toBe(201); return (await response.json()).data as Value;
}
const plan = (title: string) => ({ title, status: "TODO", dueAt: null, notes: "私人计划", milestone: "验收", sortOrder: 0 });

test("settings exports, downloads, clears and restores a real account backup through the rendered UI", async ({ page }) => {
  test.setTimeout(180000);
  const account = await createLiveAccount(page.request, "backup-ui");
  const title = `页面恢复的计划 ${randomUUID().slice(0, 8)}`;
  await data(page.request, "/planner/tasks", "POST", plan(title), 201);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "导出私人数据", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "生成备份", exact: true }).click();
  const downloadButton = page.getByRole("button", { name: "下载生成的备份", exact: true });
  await expect(downloadButton).toBeEnabled({ timeout: 60000 });
  const downloaded = page.waitForEvent("download");
  await downloadButton.click();
  const backup = await downloaded;
  expect(await backup.failure()).toBeNull();
  const archive = readFileSync((await backup.path())!);
  expect(archive.subarray(0, 2).toString()).toBe("PK");

  await page.getByRole("button", { name: "清空工作区…", exact: true }).click();
  const resetDialog = page.getByRole("dialog", { name: "清空私人工作区", exact: true });
  await resetDialog.getByLabel("输入 RESET 以确认", { exact: true }).fill("RESET");
  await resetDialog.getByLabel("当前密码（验证窗口十分钟）", { exact: true }).fill(account.password);
  await resetDialog.getByRole("button", { name: "验证并确认", exact: true }).click();
  await expect(resetDialog).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "私人数据操作已完成" })).toBeVisible({ timeout: 60000 });
  expect(await data(page.request, "/planner/tasks")).toHaveLength(0);

  await page.getByLabel("ZIP 备份（最大 100 MiB）", { exact: true }).setInputFiles({ name: "浏览器备份.zip", mimeType: "application/zip", buffer: archive });
  await page.getByRole("button", { name: "上传并预览恢复", exact: true }).click();
  await expect(page.getByRole("heading", { name: "备份校验通过", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认恢复…", exact: true }).click();
  const restoreDialog = page.getByRole("dialog", { name: "恢复并覆盖私人数据", exact: true });
  await restoreDialog.getByLabel("输入 RESTORE 以确认", { exact: true }).fill("RESTORE");
  await restoreDialog.getByLabel("当前密码（验证窗口十分钟）", { exact: true }).fill(account.password);
  await restoreDialog.getByRole("button", { name: "验证并确认", exact: true }).click();
  await expect(restoreDialog).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "私人数据操作已完成" })).toBeVisible({ timeout: 60000 });
  await page.goto("/planner");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.screenshot({ path: "qa/accountdata-real-restored.png", fullPage: true });
});

test("signed backups survive private reset, reject foreign/tampered/stale imports, and account erasure revokes all sessions", async ({ browser }) => {
  test.setTimeout(240000);
  const baseURL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5179", baseAPI = process.env.API_URL ?? "http://127.0.0.1:8080";
  const owner = await browser.newContext({ baseURL }), peer = await browser.newContext({ baseURL }), oldSession = await browser.newContext({ baseURL }), admin = await browser.newContext({ baseURL });
  try {
    const account = await createLiveAccount(owner.request, "backup-owner"); await createLiveAccount(peer.request, "backup-peer");
    await data(oldSession.request, "/auth/login", "POST", { email: account.email, password: account.password });
    const original = Buffer.from("教育背景\n项目经历：事务与并发\n技能 Java SQL\n", "utf8"), originalFile = await upload(owner.request, original, "RESUME", "备份原件.txt");
    const originalResume = await data(owner.request, "/resumes", "POST", { name: "备份简历", fileId: originalFile.id, text: original.toString(), extractionState: "TEXT_READY" }, 201);
    const originalPlan = await data(owner.request, "/planner/tasks", "POST", plan("备份里的任务"), 201), peerPlan = await data(peer.request, "/planner/tasks", "POST", plan("其他账号保留"), 201);
    const exportKey = randomUUID(), queued = await data(owner.request, "/account/exports", "POST", { includeFiles: true }, 202, exportKey);
    expect((await data(owner.request, "/account/exports", "POST", { includeFiles: true }, 202, exportKey)).id).toBe(queued.id);
    await data(peer.request, `/tasks/${queued.id}`, "GET", undefined, 404);
    const exported = await finished(owner.request, queued.id), download = await owner.request.get(`${baseAPI}/api/v1/files/${exported.resultFileId}/download`);
    expect(download.status()).toBe(200); const archive = await download.body(); expect(archive.subarray(0, 2).toString()).toBe("PK");
    expect(download.headers()["x-content-sha256"]).toBe(createHash("sha256").update(archive).digest("hex"));
    expect((await peer.request.get(`${baseAPI}/api/v1/files/${exported.resultFileId}/download`)).status()).toBe(404);
    const foreignUpload = await upload(peer.request, archive, "BACKUP", "其他账号.zip"), foreignPreview = await data(peer.request, "/account/import-previews", "POST", { fileId: foreignUpload.id }, 201);
    expect(foreignPreview.state).toBe("INVALID"); expect(foreignPreview.issues.length).toBeGreaterThan(0);
    await data(owner.request, "/account/import-previews", "POST", { fileId: foreignUpload.id }, 404);
    // Rebuild a valid ZIP/CRC while changing only the HMAC signature entry.
    const tampered = execFileSync("python3", ["-c", "import io,sys,zipfile; src=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); out=io.BytesIO(); dst=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED); [(dst.writestr(n, ((b'1' if src.read(n)[:1]!=b'1' else b'2')+src.read(n)[1:]) if n=='manifest.sig' else src.read(n))) for n in src.namelist()]; dst.close(); sys.stdout.buffer.write(out.getvalue())"], { input: archive });
    const bad = await upload(owner.request, tampered, "BACKUP", "错误签名.zip"), invalid = await data(owner.request, "/account/import-previews", "POST", { fileId: bad.id }, 201);
    expect(invalid.state).toBe("INVALID"); expect(invalid.issues.join(" ")).toContain("签名");
    const firstFile = await upload(owner.request, archive, "BACKUP", "待恢复.zip"), firstPreview = await data(owner.request, "/account/import-previews", "POST", { fileId: firstFile.id }, 201);
    expect(firstPreview.state, firstPreview.issues.join(" ")).toBe("VALID"); expect(firstPreview.fileCount).toBe(1); expect(firstPreview.recordCount).toBe(2);
    // A password login already grants the ten-minute recent-auth window. A peer still cannot apply this preview.
    await data(peer.request, `/account/import-previews/${firstPreview.id}/apply`, "POST", { confirm: "RESTORE", dataRevision: firstPreview.dataRevision }, 404);
    await data(owner.request, "/planner/tasks", "POST", plan("预览后的变更"), 201);
    await data(owner.request, "/auth/reauth", "POST", { password: account.password });
    const conflict = await data(owner.request, `/account/import-previews/${firstPreview.id}/apply`, "POST", { confirm: "RESTORE", dataRevision: firstPreview.dataRevision }, 409);
    expect(conflict.code).toBe("DATA_REVISION_CONFLICT"); expect((await data(owner.request, "/planner/tasks")).length).toBe(2);
    const beforeReset = await data(owner.request, "/account/data-revision"), resetKey = randomUUID();
    const reset = await data(owner.request, "/account/reset", "POST", { confirm: "RESET", dataRevision: beforeReset.dataRevision }, 202, resetKey); await finished(owner.request, reset.id);
    expect((await data(owner.request, "/resumes")).length).toBe(0); expect((await data(owner.request, "/planner/tasks")).length).toBe(0);
    expect((await owner.request.get(`${baseAPI}/api/v1/files/${originalFile.id}/download`)).status()).toBe(404);
    expect((await data(owner.request, "/me")).id).toBe(account.userId);
    expect((await data(owner.request, "/account/reset", "POST", { confirm: "RESET", dataRevision: beforeReset.dataRevision }, 202, resetKey)).id).toBe(reset.id);
    const restoredUpload = await upload(owner.request, archive, "BACKUP", "清空后恢复.zip"), preview = await data(owner.request, "/account/import-previews", "POST", { fileId: restoredUpload.id }, 201);
    expect(preview.state, preview.issues.join(" ")).toBe("VALID");
    await data(owner.request, "/auth/reauth", "POST", { password: account.password });
    const restore = await data(owner.request, `/account/import-previews/${preview.id}/apply`, "POST", { confirm: "RESTORE", dataRevision: preview.dataRevision }, 202); await finished(owner.request, restore.id);
    const resumes = await data(owner.request, "/resumes"), restored = resumes.find((row: Value) => row.id === originalResume.id);
    expect(restored.text).toBe(original.toString()); expect(restored.fileId).not.toBe(originalFile.id); expect(restored.version).toBeGreaterThan(originalResume.version);
    const restoredBytes = await owner.request.get(`${baseAPI}/api/v1/files/${restored.fileId}/download`); expect(restoredBytes.status()).toBe(200); expect(await restoredBytes.body()).toEqual(original);
    expect((await data(owner.request, "/planner/tasks")).map((row: Value) => row.id)).toEqual([originalPlan.id]);
    expect((await data(peer.request, "/planner/tasks")).map((row: Value) => row.id)).toEqual([peerPlan.id]);
    const catalog = await ensureLiveCatalog(admin.request); await data(admin.request, "/auth/login", "POST", { email: catalog.admin.email, password: catalog.admin.password });
    const post = await data(owner.request, "/posts", "POST", { bodyMd: "保留的公开内容", tags: ["验收"] }, 201);
    await data(admin.request, `/admin/moderation/POST/${post.id}/decisions`, "POST", { version: post.version, decision: "APPROVE", reason: "独立测试库注销匿名化验收" });
    await data(owner.request, "/auth/reauth", "POST", { password: account.password });
    const erasure = await data(owner.request, "/me", "DELETE", { confirm: "DELETE" }, 202);
    await data(owner.request, "/me", "GET", undefined, 401); await data(oldSession.request, "/me", "GET", undefined, 401);
    await data(owner.request, `/tasks/${erasure.id}`, "GET", undefined, 401);
    await expect.poll(async () => (await data(admin.request, "/admin/tasks?page=1&size=100")).find((row: Value) => row.id === erasure.id)?.state, { timeout: 60000 }).toBe("SUCCEEDED");
    const publicPost = (await data(peer.request, "/posts?page=1&size=100")).find((row: Value) => row.id === post.id); expect(publicPost?.bodyMd).toBe("保留的公开内容"); expect(publicPost.authorId).toBeNull();
    expect((await peer.request.get(`${baseAPI}/api/v1/files/${restored.fileId}/download`)).status()).toBe(404);
    await data(owner.request, "/auth/login", "POST", { email: account.email, password: account.password }, 401);
  } finally { await owner.close(); await peer.close(); await oldSession.close(); await admin.close(); }
});
