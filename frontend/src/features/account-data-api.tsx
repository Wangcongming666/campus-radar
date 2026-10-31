import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest as request, clearCsrf } from "../api/auth";
import { downloadPrivateFile, type PrivateFile } from "../api/resume";
import { Button, Field, Modal, Panel } from "../components/ui";
import type { components } from "../api/generated";

type Task = components["schemas"]["Task"];
type Preview = components["schemas"]["ImportPreview"];
type Operation = "RESTORE" | "RESET" | "DELETE";
const running = (task: Task | null) =>
  !!task && ["QUEUED", "RUNNING", "RETRY_WAIT"].includes(task.state);
const taskNames = {
  DATA_EXPORT: "导出备份",
  DATA_IMPORT: "恢复备份",
  USER_ERASURE: "清空工作区",
  SUBSCRIPTION_SCAN: "扫描订阅",
  SEND_MAIL: "发送邮件",
  FILE_ERASURE: "擦除文件",
};
const stateNames = {
  QUEUED: "等待处理",
  RUNNING: "正在处理",
  RETRY_WAIT: "等待后台重试",
  SUCCEEDED: "处理完成",
  FAILED: "处理失败",
  CANCELLED: "已取消",
};
export function ApiAccountDataTools({
  onWorkspaceChanged,
}: {
  onWorkspaceChanged?: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<"export" | "backups" | "restore" | null>(
    null,
  );
  const lifetime = useRef(new AbortController());
  const submitting = useRef(false);
  useEffect(() => {
    const active = new AbortController();
    lifetime.current = active;
    return () => active.abort();
  }, []);
  async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const signal = options.signal ?? lifetime.current.signal;
    const result = await request<T>(path, { ...options, signal });
    if (signal.aborted || lifetime.current.signal.aborted)
      throw new DOMException("Aborted", "AbortError");
    return result;
  }
  async function post<T>(
    path: string,
    body: unknown,
    key: string,
    method = "POST",
  ) {
    return apiRequest<T>(path, {
      method,
      headers: { "Idempotency-Key": key },
      body: JSON.stringify(body),
    });
  }
  const [includeFiles, setIncludeFiles] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [backups, setBackups] = useState<PrivateFile[]>([]);
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pollError, setPollError] = useState("");
  const [operation, setOperation] = useState<Operation | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const keys = useRef({
    export: crypto.randomUUID(),
    upload: crypto.randomUUID(),
    preview: crypto.randomUUID(),
    operation: crypto.randomUUID(),
  });
  const uploaded = useRef<string | null>(null);
  const locked = busy || running(task);
  async function refreshBackups(signal?: AbortSignal) {
    const files = await apiRequest<PrivateFile[]>(
      "/api/v1/files?page=1&size=100",
      { signal },
    );
    setBackups(
      files.filter(
        (item) => item.purpose === "BACKUP" && item.state === "READY",
      ),
    );
  }
  useEffect(() => {
    const controller = new AbortController();
    void refreshBackups(controller.signal).catch((reason) => {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : "无法加载备份。");
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!task || !running(task)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const id = task.id;
    async function poll() {
      try {
        const next = await apiRequest<Task>(`/api/v1/tasks/${id}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setTask(next);
        setPollError("");
        if (!running(next)) {
          if (next.state === "SUCCEEDED") {
            setMessage(
              next.type === "DATA_EXPORT"
                ? "备份已生成，可下载保存。签名和服务端副本保留七天。"
                : "私人数据操作已完成。页面会重新读取最新资料。",
            );
            if (next.type !== "DATA_EXPORT") {
              setPreview(null);
              window.dispatchEvent(new Event("campus:account-changed"));
              if (onWorkspaceChanged) await onWorkspaceChanged();
            }
            await refreshBackups(controller.signal);
          }
          return;
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setPollError(
          reason instanceof Error ? reason.message : "暂时无法读取任务状态。",
        );
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => void poll(), 2000);
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
    // Polling owns updates for this task until it reaches a terminal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);
  async function run(work: () => Promise<void>) {
    if (locked || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (reason) {
      if (!lifetime.current.signal.aborted)
        setError(
          reason instanceof Error ? reason.message : "操作失败，请重试。",
        );
    } finally {
      if (!lifetime.current.signal.aborted) {
        submitting.current = false;
        setBusy(false);
      }
    }
  }
  async function exportBackup() {
    await run(async () => {
      const next = await post<Task>(
        "/api/v1/account/exports",
        { includeFiles },
        keys.current.export,
      );
      keys.current.export = crypto.randomUUID();
      setTask(next);
      setMessage("导出任务已受理，完成后可下载。");
    });
  }
  async function previewBackup(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    await run(async () => {
      if (
        file.size > 100 * 1024 * 1024 ||
        file.size === 0 ||
        !/\.zip$/i.test(file.name)
      )
        throw new Error("请选择不超过 100 MiB 的 ZIP 备份。");
      if (!uploaded.current) {
        const form = new FormData();
        form.set("purpose", "BACKUP");
        form.set("file", file);
        uploaded.current = (
          await apiRequest<PrivateFile>("/api/v1/files", {
            method: "POST",
            headers: { "Idempotency-Key": keys.current.upload },
            body: form,
          })
        ).id;
      }
      setPreview(
        await post<Preview>(
          "/api/v1/account/import-previews",
          { fileId: uploaded.current },
          keys.current.preview,
        ),
      );
      keys.current.preview = crypto.randomUUID();
      await refreshBackups();
    });
  }
  async function openOperation(next: Operation) {
    await run(async () => {
      if (next === "RESTORE") {
        if (!preview || preview.state !== "VALID")
          throw new Error("请先生成有效的恢复预览。");
        if (Date.parse(preview.expiresAt) <= Date.now())
          throw new Error("预览已过期，请重新预览。");
        setRevision(preview.dataRevision);
      } else if (next === "RESET")
        setRevision(
          (
            await apiRequest<components["schemas"]["DataRevision"]>(
              "/api/v1/account/data-revision",
            )
          ).dataRevision,
        );
      keys.current.operation = crypto.randomUUID();
      setPassword("");
      setConfirmation("");
      setOperation(next);
    });
  }
  async function confirmOperation(event: FormEvent) {
    event.preventDefault();
    if (!operation || confirmation !== operation) return;
    await run(async () => {
      await apiRequest("/api/v1/auth/reauth", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setPassword("");
      if (operation === "DELETE") {
        await post<Task>(
          "/api/v1/me",
          { confirm: "DELETE" },
          keys.current.operation,
          "DELETE",
        );
        clearCsrf();
        window.dispatchEvent(new Event("campus:account-changed"));
        navigate("/login?deleted=1", { replace: true });
        return;
      }
      if (revision === null) throw new Error("数据版本缺失，请重新打开确认。");
      const path =
        operation === "RESTORE"
          ? `/api/v1/account/import-previews/${preview!.id}/apply`
          : "/api/v1/account/reset";
      setTask(
        await post<Task>(
          path,
          { confirm: operation, dataRevision: revision },
          keys.current.operation,
        ),
      );
      setOperation(null);
      setMessage("操作已受理，完成前私人数据暂时禁止修改。");
    });
  }
  async function download(id: string, name: string) {
    await run(async () => {
      const signal = lifetime.current.signal;
      const bytes = await downloadPrivateFile(id, signal);
      if (signal.aborted) return;
      const url = URL.createObjectURL(bytes);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  const closeView = () => {
    if (!busy) {
      setView(null);
      setError("");
    }
  };
  return (
    <div className="settings-data">
      <Panel className="settings-editor">
        <div className="settings-section-heading">
          <h2>数据管理</h2>
          <p>
            私人记录由你管理。日常备份与恢复按需打开，清空和注销前需要再次验证身份。
          </p>
        </div>
        <div className="settings-data-actions">
          <div>
            <div>
              <h3>导出私人数据</h3>
              <p>将投递、简历、练习、规划等记录打包保存。</p>
            </div>
            <Button
              disabled={locked}
              onClick={() => {
                setError("");
                setView("export");
              }}
            >
              生成备份
            </Button>
          </div>
          <div>
            <div>
              <h3>备份文件</h3>
              <p>查看当前账号最近生成或上传的备份。</p>
            </div>
            <Button
              disabled={busy}
              onClick={() => {
                setError("");
                setView("backups");
              }}
            >
              查看备份
            </Button>
          </div>
          <div>
            <div>
              <h3>从备份恢复</h3>
              <p>先上传并校验，再确认是否覆盖当前私人工作区。</p>
            </div>
            <Button
              disabled={locked}
              onClick={() => {
                setError("");
                setView("restore");
              }}
            >
              恢复数据
            </Button>
          </div>
        </div>
      </Panel>
      {error && !view && !operation && (
        <p className="settings-feedback settings-feedback-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p
          className="settings-feedback settings-feedback-success"
          role="status"
        >
          {message}
        </p>
      )}
      {task && (
        <Panel title={taskNames[task.type]} className="settings-task">
          <p role="status">
            {stateNames[task.state]} · {task.progress}% · 已尝试 {task.attempt}{" "}
            次
          </p>
          <progress max={100} value={task.progress} aria-label="数据任务进度" />
          {task.errorCode && (
            <p role="alert">
              处理原因：{task.errorCode}
              {task.state === "FAILED" && "。请保留任务编号并联系管理员处理。"}
            </p>
          )}
          <p className="muted small">任务编号：{task.id}</p>
          {pollError && (
            <p role="alert">{pollError} 正在继续检查；请勿重复提交。</p>
          )}
          {task.state === "SUCCEEDED" && task.resultFileId && (
            <Button
              disabled={locked}
              onClick={() =>
                void download(task.resultFileId!, "campus-radar-backup.zip")
              }
            >
              下载生成的备份
            </Button>
          )}
        </Panel>
      )}
      <Panel className="settings-danger-zone">
        <div className="settings-section-heading">
          <h2>谨慎操作</h2>
          <p>这些操作会删除数据，请先确认已经保存需要的备份。</p>
        </div>
        <div className="settings-data-actions">
          <div>
            <div>
              <h3>清空私人工作区</h3>
              <p>删除私人记录与附件，保留账号身份和已发布的公开内容。</p>
            </div>
            <Button
              variant="danger"
              disabled={locked}
              onClick={() => void openOperation("RESET")}
            >
              清空工作区…
            </Button>
          </div>
          <div>
            <div>
              <h3>永久注销账号</h3>
              <p>
                删除账号、私人资料与协作关系；公开内容保留并匿名化。不可撤销。
              </p>
            </div>
            <Button
              variant="danger"
              disabled={locked}
              onClick={() => void openOperation("DELETE")}
            >
              注销账号…
            </Button>
          </div>
        </div>
      </Panel>
      <Modal
        open={view !== null}
        onClose={closeView}
        title={
          view === "export"
            ? "导出私人数据"
            : view === "restore"
              ? "从备份恢复"
              : "最近的备份文件"
        }
        dismissOnOutside={false}
      >
        <div className="settings-data-dialog stack">
          {error && !operation && (
            <p
              role="alert"
              className="settings-feedback settings-feedback-error"
            >
              {error}
            </p>
          )}
          {view === "export" && (
            <>
              <p className="muted">
                保存资料、投递、简历文字、学习、练习、规划、Offer、收藏与订阅等私人记录。
              </p>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={includeFiles}
                  disabled={locked}
                  onChange={(event) => {
                    setIncludeFiles(event.target.checked);
                    keys.current.export = crypto.randomUUID();
                  }}
                />
                包含简历、录音和头像原件
              </label>
              <div className="settings-data-note">
                <p>备份只允许同一账号、同一环境在七天内恢复。</p>
                <p>
                  不含原件的备份恢复时，要求对应文件仍保存在账号中。备份含敏感私人信息，请妥善保管。
                </p>
              </div>
              {message && <p role="status">{message}</p>}
              <div className="settings-dialog-footer">
                <Button disabled={busy} onClick={closeView}>
                  关闭
                </Button>
                <Button
                  variant="primary"
                  disabled={locked}
                  onClick={() => void exportBackup()}
                >
                  {locked ? "正在处理…" : "开始生成备份"}
                </Button>
              </div>
              <p className="muted small">
                任务受理后可关闭此弹窗，在数据管理页查看进度。
              </p>
            </>
          )}
          {view === "backups" && (
            <>
              <p className="muted">
                只展示当前账号最近 100 个文件中的可用备份。
              </p>
              {backups.length === 0 ? (
                <p className="settings-data-note">
                  暂无可用备份。生成完成后，可刷新列表查看。
                </p>
              ) : (
                backups.map((backup) => (
                  <div className="settings-backup-row" key={backup.id}>
                    <div>
                      <strong>{backup.name}</strong>
                      <p className="muted small">
                        {Math.ceil(backup.sizeBytes / 1024)} KiB ·{" "}
                        {new Date(backup.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <Button
                      disabled={locked}
                      onClick={() => void download(backup.id, backup.name)}
                    >
                      下载
                    </Button>
                  </div>
                ))
              )}
              <Button
                disabled={locked}
                onClick={() => void run(() => refreshBackups())}
              >
                刷新备份列表
              </Button>
            </>
          )}
          {view === "restore" && (
            <>
              <p className="muted">
                恢复会覆盖当前私人工作区，保留账号身份与公开内容。请先导出当前数据，再上传本账号的有效备份。
              </p>
              <form onSubmit={previewBackup} className="stack">
                <Field
                  label="ZIP 备份文件"
                  hint="最大 100 MiB，仅接受本账号的有效 ZIP 备份。"
                >
                  <input
                    aria-label="ZIP 备份文件"
                    className="input"
                    type="file"
                    accept=".zip,application/zip"
                    disabled={locked}
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setPreview(null);
                      uploaded.current = null;
                      keys.current.upload = crypto.randomUUID();
                      keys.current.preview = crypto.randomUUID();
                    }}
                  />
                </Field>
                {file && <p className="muted small">已选择：{file.name}</p>}
                <Button
                  type="submit"
                  variant="primary"
                  disabled={locked || !file}
                >
                  {busy ? "正在校验…" : "上传并预览恢复"}
                </Button>
              </form>
              {preview && (
                <section className="settings-restore-preview stack">
                  <h3>
                    {preview.state === "VALID"
                      ? "备份校验通过"
                      : "备份无法恢复"}
                  </h3>
                  <p>
                    私人记录 {preview.recordCount} 条 · 文件 {preview.fileCount}{" "}
                    个 · 当前数据版本 {preview.dataRevision}
                  </p>
                  <p className="muted small">
                    预览有效至{" "}
                    {new Date(preview.expiresAt).toLocaleString("zh-CN")}
                    。预览后数据有任何变更都需要重新预览。
                  </p>
                  {preview.issues.length > 0 && (
                    <ul role="alert">
                      {preview.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  <Button
                    variant="danger"
                    disabled={locked || preview.state !== "VALID"}
                    onClick={() => void openOperation("RESTORE")}
                  >
                    确认恢复…
                  </Button>
                </section>
              )}
            </>
          )}
        </div>
      </Modal>
      <Modal
        open={operation !== null}
        layer={view ? 1 : 0}
        dismissOnOutside={false}
        onClose={() => {
          if (!busy) {
            setOperation(null);
            setPassword("");
          }
        }}
        title={
          operation === "RESTORE"
            ? "恢复并覆盖私人数据"
            : operation === "RESET"
              ? "清空私人工作区"
              : "永久注销账号"
        }
      >
        <form
          onSubmit={confirmOperation}
          className="settings-data-dialog stack"
        >
          <p>
            {operation === "DELETE"
              ? "确认后会立即退出登录。账号注销任务由后台执行，不能撤销。"
              : operation === "RESET"
                ? "将删除投递、简历、练习、日程、规划、Offer、收藏、订阅、通知与附件，并重置私人偏好。保留账号与已发布内容。附件只能通过包含原件的有效备份恢复。"
                : "恢复将覆盖当前私人工作区。服务端会核对数据版本，受理后暂时冻结私人写入。请先保存需要的备份。"}
          </p>
          <Field
            label={`输入 ${operation ?? ""} 以确认`}
            hint="此确认用于防止误操作，请按上方大写字母输入。"
          >
            <input
              className="input"
              value={confirmation}
              autoComplete="off"
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
              required
            />
          </Field>
          <Field label="当前登录密码" hint="提交前验证身份，验证窗口为十分钟。">
            <input
              aria-label="当前登录密码"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={busy}
              required
              maxLength={128}
              placeholder="输入当前密码"
            />
          </Field>
          {error && (
            <p
              role="alert"
              className="settings-feedback settings-feedback-error"
            >
              {error}
            </p>
          )}
          <div className="settings-dialog-footer">
            <Button
              disabled={busy}
              onClick={() => {
                setOperation(null);
                setPassword("");
              }}
            >
              取消
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={busy || confirmation !== operation || !password}
            >
              {busy ? "正在提交…" : "验证并确认"}
            </Button>
          </div>
        </form>
      </Modal>
      <p className="muted small">
        数据任务由后台处理。如需帮助，请保留任务编号。
      </p>
    </div>
  );
}
