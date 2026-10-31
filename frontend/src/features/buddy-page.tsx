import { useCallback, useEffect, useRef, useState, useId } from "react";
import {
  Search,
  Users,
  ArrowRight,
  Plus,
  LockKeyhole,
  Globe2,
  Mail,
  Check,
} from "lucide-react";
import { useAccount } from "../app/api-shell";
import { apiRequest, ApiError } from "../api/auth";
import { personalRequest, type PageResult, type Schema } from "../api/personal";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeader,
  Tabs,
} from "../components/ui";
import { startVisiblePolling } from "./social-visible-polling";
import "./buddy.css";

type Room = Schema<"BuddyRoom">;
type Invitation = Schema<"Invitation">;
type Member = Schema<"RoomMember">;
type Task = Schema<"RoomTask">;
type Candidate = Schema<"BuddyCandidate">;
type Creation = {
  name: string;
  description: string;
  capacity: string;
  visibility: "PUBLIC" | "INVITE_ONLY";
  open: boolean;
};
type TaskDraft = { title: string; due: string; open?: boolean };
// Memory only: retain uncertain requests during reconnect, never across accounts.
let draftOwner: string | null = null;
let epoch = 0;
let creation: Creation = {
  name: "",
  description: "",
  capacity: "6",
  visibility: "PUBLIC",
  open: false,
};
const taskDrafts = new Map<string, TaskDraft>();
const pendingWrites = new Set<AbortController>();
const writeKeys = new Map<string, { payload: string; key: string }>();
function clearMemory() {
  pendingWrites.forEach((controller) => controller.abort());
  pendingWrites.clear();
  epoch++;
  draftOwner = null;
  creation = {
    name: "",
    description: "",
    capacity: "6",
    visibility: "PUBLIC",
    open: false,
  };
  taskDrafts.clear();
  writeKeys.clear();
}
if (typeof window !== "undefined")
  window.addEventListener("campus:account-changed", clearMemory);
function claimOwner(owner: string) {
  if (draftOwner !== owner) {
    clearMemory();
    draftOwner = owner;
  }
}
function useCreateDraft(owner: string) {
  claimOwner(owner);
  const [, rerender] = useState(0);
  function update(patch: Partial<Creation>) {
    creation = { ...creation, ...patch };
    rerender((x) => x + 1);
  }
  return { draft: creation, update };
}
function useTaskDraft(owner: string, roomId: string) {
  claimOwner(owner);
  const [, rerender] = useState(0);
  const draft = taskDrafts.get(roomId) ?? { title: "", due: "" };
  function update(patch: Partial<TaskDraft>) {
    taskDrafts.set(roomId, { ...draft, ...patch });
    rerender((x) => x + 1);
  }
  return { draft, update };
}
function message(reason: unknown) {
  const text =
    reason instanceof Error ? reason.message : "操作未完成，请重试。";
  return reason instanceof ApiError && reason.status === 409
    ? `${text} 数据可能已变化。请刷新查看最新状态，核对后再重试；输入已保留。`
    : text;
}
async function readAll<T>(path: string, signal: AbortSignal) {
  const rows: T[] = [];
  for (let page = 1; page <= 500; page++) {
    const result = await personalRequest<PageResult<T>>(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&size=100`,
      "GET",
      undefined,
      signal,
    );
    rows.push(...result.data);
    if (!result.page.hasMore) return rows;
  }
  throw new Error("记录超过 50,000 条读取上限，当前列表未展示，请稍后重试。");
}
function useRead<T>(
  owner: string,
  resource: string,
  load: (signal: AbortSignal) => Promise<T>,
) {
  const [state, setState] = useState<{
    owner: string;
    resource: string;
    data?: T;
    error: string;
    loading: boolean;
  }>({ owner, resource, error: "", loading: true });
  const [tick, setTick] = useState(0);
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    const controller = new AbortController(),
      started = epoch;
    setState((old) =>
      old.owner === owner && old.resource === resource
        ? { ...old, loading: old.data === undefined, error: "" }
        : { owner, resource, error: "", loading: true },
    );
    void loader
      .current(controller.signal)
      .then((data) => {
        if (
          !controller.signal.aborted &&
          started === epoch &&
          draftOwner === owner
        )
          setState({ owner, resource, data, error: "", loading: false });
      })
      .catch((reason) => {
        if (
          !controller.signal.aborted &&
          started === epoch &&
          draftOwner === owner
        )
          setState({ owner, resource, error: message(reason), loading: false });
      });
    return () => controller.abort();
  }, [owner, resource, tick]);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return {
    ...(state.owner === owner && state.resource === resource
      ? state
      : { data: undefined, error: "", loading: true }),
    refresh,
  };
}
function usePoll(refresh: () => void) {
  const latest = useRef(refresh);
  latest.current = refresh;
  useEffect(() => startVisiblePolling(() => latest.current()), []);
}
function useWrite(owner: string) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = useRef(false),
    inFlight = useRef(false),
    controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      controllers.current.forEach((c) => c.abort());
    };
  }, [owner]);
  async function run(
    path: string,
    method: "POST" | "PUT" | "PATCH",
    body?: unknown,
    after?: () => void,
  ) {
    if (inFlight.current || draftOwner !== owner) return;
    const started = epoch,
      controller = new AbortController();
    controllers.current.add(controller);
    pendingWrites.add(controller);
    const current = () =>
      live.current &&
      draftOwner === owner &&
      started === epoch &&
      !controller.signal.aborted;
    const slot = `${method}:${path}`,
      payload = JSON.stringify(body) ?? "";
    let entry = writeKeys.get(slot);
    if (!entry || entry.payload !== payload) {
      entry = { payload, key: crypto.randomUUID() };
      writeKeys.set(slot, entry);
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await apiRequest(`/api/v1${path}`, {
        method,
        signal: controller.signal,
        headers:
          method === "POST" ? { "Idempotency-Key": entry.key } : undefined,
        body: body === undefined ? undefined : payload,
      });
      if (current()) {
        if (writeKeys.get(slot) === entry) writeKeys.delete(slot);
        after?.();
      }
    } catch (reason) {
      if (current()) setError(message(reason));
    } finally {
      controllers.current.delete(controller);
      pendingWrites.delete(controller);
      inFlight.current = false;
      if (current()) setBusy(false);
    }
  }
  return { busy, error, run, clear: () => setError("") };
}
function ReadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (error)
    return (
      <div className="buddy-error" role="alert">
        <strong>暂时无法读取</strong>
        <p>{error}</p>
        <Button onClick={retry}>重新加载</Button>
      </div>
    );
  if (loading)
    return (
      <div className="buddy-loading" role="status">
        <span />
        <span />
        <p>正在读取房间信息…</p>
      </div>
    );
  return null;
}
function RoomMeta({ room }: { room: Room }) {
  return (
    <div className="buddy-meta">
      <Badge tone={room.state === "OPEN" ? "green" : "muted"}>
        {room.state === "OPEN" ? "开放中" : "已关闭"}
      </Badge>
      <span>
        {room.visibility === "PUBLIC" ? (
          <Globe2 size={14} />
        ) : (
          <LockKeyhole size={14} />
        )}
        {room.visibility === "PUBLIC" ? "公开加入" : "仅限邀请"}
      </span>
      <span>
        <Users size={14} />
        {room.memberCount} / {room.capacity} 人
      </span>
    </div>
  );
}
const invitationState = {
  PENDING: "待处理",
  ACCEPTED: "已接受",
  DECLINED: "已拒绝",
  EXPIRED: "已过期",
};
function date(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function ApiBuddyPage() {
  const { user } = useAccount();
  if (!user || user.role !== "USER") return null;
  claimOwner(user.id);
  return <OwnedBuddyPage key={`${user.id}:${epoch}`} owner={user.id} />;
}
function OwnedBuddyPage({ owner }: { owner: string }) {
  const create = useCreateDraft(owner),
    write = useWrite(owner);
  const [tab, setTab] = useState("mine"),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const rooms = useRead(owner, "rooms", async (signal) => {
    const [publicRooms, mine, invitations] = await Promise.all([
      readAll<Room>("/buddy/rooms", signal),
      readAll<Room>("/buddy/rooms?mine=true", signal),
      readAll<Invitation>("/buddy/invitations", signal),
    ]);
    return { publicRooms, mine, invitations };
  });
  usePoll(rooms.refresh);
  const data = rooms.data,
    own = data?.mine ?? [],
    displayed = (tab === "mine" ? own : (data?.publicRooms ?? [])).filter(
      (room) =>
        `${room.name} ${room.description}`
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
    );
  const room = own.find((r) => r.id === selected);
  function refresh() {
    rooms.refresh();
  }
  return (
    <div className="stack buddy-page">
      <PageHeader
        title="同路人"
        description="找到一起准备校招的人，共享任务，各自记录完成情况。"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              write.clear();
              create.update({ open: true });
            }}
          >
            <Plus size={16} />
            创建房间
          </Button>
        }
      />
      {notice && (
        <p className="buddy-notice" role="status">
          {notice}
        </p>
      )}
      {write.error && !create.draft.open && (
        <p className="buddy-error" role="alert">
          {write.error}
        </p>
      )}
      <div className="buddy-layout">
        <section className="buddy-main" aria-label="房间列表">
          <div className="buddy-toolbar">
            <Tabs
              value={tab}
              onChange={(v) => {
                setTab(v);
                setFilter("");
              }}
              items={[
                { value: "mine", label: "我的房间", count: data?.mine.length },
                {
                  value: "discover",
                  label: "发现房间",
                  count: data?.publicRooms.length,
                },
              ]}
            />
            <Button variant="ghost" onClick={refresh}>
              刷新
            </Button>
          </div>
          <div className="buddy-list-heading">
            <div>
              <h2>{tab === "mine" ? "一起完成下一步" : "开放的学习小组"}</h2>
              <p>
                {tab === "mine"
                  ? "打开已加入的房间，查看成员与共享任务。"
                  : "公开房间可以直接加入；仅邀请房间通过邀请进入。"}
              </p>
            </div>
          </div>
          <label className="buddy-search">
            <Search size={17} />
            <input
              className="input"
              aria-label="筛选当前房间列表"
              placeholder="在已加载的房间中搜索名称、介绍"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              maxLength={100}
            />
          </label>
          <ReadState {...rooms} retry={refresh} />
          {data && (
            <>
              <p className="buddy-result-count">
                {filter
                  ? `当前列表匹配 ${displayed.length} 个房间`
                  : `共 ${displayed.length} 个房间`}
              </p>
              <div className="buddy-room-list">
                {displayed.map((r) => {
                  const joined = own.some((x) => x.id === r.id),
                    full = r.memberCount >= r.capacity;
                  return (
                    <article className="buddy-room" key={r.id}>
                      <RoomMeta room={r} />
                      <h3>{r.name}</h3>
                      <p className="buddy-room-description">
                        {r.description || "房主尚未填写介绍。"}
                      </p>
                      <footer>
                        <span>
                          {r.ownerId === owner
                            ? "我是房主"
                            : joined
                              ? "我是成员"
                              : full
                                ? "人数已满"
                                : "加入后可查看成员和共享任务"}
                        </span>
                        {joined ? (
                          <Button onClick={() => setSelected(r.id)}>
                            打开房间
                            <ArrowRight size={15} />
                          </Button>
                        ) : (
                          <Button
                            variant="primary"
                            disabled={
                              write.busy ||
                              full ||
                              r.state !== "OPEN" ||
                              r.visibility !== "PUBLIC"
                            }
                            onClick={() =>
                              void write.run(
                                `/buddy/rooms/${r.id}/join`,
                                "POST",
                                undefined,
                                () => {
                                  setNotice(
                                    "已加入房间，可在「我的房间」查看。",
                                  );
                                  setTab("mine");
                                  refresh();
                                },
                              )
                            }
                          >
                            {full ? "已满员" : "加入房间"}
                          </Button>
                        )}
                      </footer>
                    </article>
                  );
                })}
                {displayed.length === 0 && (
                  <Empty
                    title={
                      filter
                        ? "没有匹配的房间"
                        : tab === "mine"
                          ? "还没有加入房间"
                          : "暂无开放的公开房间"
                    }
                    description={
                      filter
                        ? "换一个名称或介绍关键词；这里仅筛选已加载的列表。"
                        : tab === "mine"
                          ? "发现一个适合的公开小组，或创建自己的学习房间。"
                          : "稍后再来看看，也可以创建房间邀请同伴。"
                    }
                    action={
                      !filter && (
                        <Button
                          onClick={() =>
                            tab === "mine"
                              ? setTab("discover")
                              : create.update({ open: true })
                          }
                        >
                          {tab === "mine" ? "发现房间" : "创建房间"}
                        </Button>
                      )
                    }
                  />
                )}
              </div>
            </>
          )}
        </section>
        <aside className="buddy-aside">
          <section
            className="buddy-invitations"
            aria-labelledby="buddy-invites-title"
          >
            <header>
              <Mail size={18} />
              <h2 id="buddy-invites-title">收到的邀请</h2>
              {data && (
                <span>
                  {data.invitations.filter((i) => i.state === "PENDING").length}{" "}
                  待处理
                </span>
              )}
            </header>
            <p className="buddy-help">接受邀请后，即可在我的房间里协作。</p>
            {!data && (
              <p className="buddy-help">
                {rooms.error
                  ? "房间和邀请暂时未能读取，请重新加载。"
                  : "正在读取邀请…"}
              </p>
            )}
            {data?.invitations.length === 0 && (
              <div className="buddy-invitation-empty">
                <strong>暂时没有邀请</strong>
                <p>有同伴邀请你时，会显示在这里。</p>
              </div>
            )}
            {data?.invitations.map((invite) => (
              <article className="buddy-invitation" key={invite.id}>
                <div>
                  <strong>
                    {[...own, ...data.publicRooms].find(
                      (r) => r.id === invite.roomId,
                    )?.name ?? `房间 ID ${invite.roomId.slice(0, 8)}`}
                  </strong>
                  <Badge tone={invite.state === "PENDING" ? "amber" : "muted"}>
                    {invitationState[invite.state]}
                  </Badge>
                </div>
                <p>
                  {invite.state === "PENDING" ? "有效至" : "邀请有效期至"}{" "}
                  {date(invite.expiresAt)}
                </p>
                {invite.state === "PENDING" && (
                  <div className="buddy-actions">
                    <Button
                      variant="primary"
                      disabled={write.busy}
                      onClick={() =>
                        void write.run(
                          `/buddy/invitations/${invite.id}`,
                          "PATCH",
                          { version: invite.version, action: "ACCEPT" },
                          () => {
                            setNotice("已接受邀请。");
                            refresh();
                          },
                        )
                      }
                    >
                      接受邀请
                    </Button>
                    <Button
                      disabled={write.busy}
                      onClick={() =>
                        void write.run(
                          `/buddy/invitations/${invite.id}`,
                          "PATCH",
                          { version: invite.version, action: "DECLINE" },
                          () => {
                            setNotice("已拒绝邀请。");
                            refresh();
                          },
                        )
                      }
                    >
                      拒绝
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </section>
          <section className="buddy-guide">
            <h2>在房间里可以做什么</h2>
            <ul>
              <li>房主添加共享任务并邀请同伴。</li>
              <li>每位成员单独勾选自己的完成情况。</li>
              <li>仅自愿公开资料的用户可被搜索邀请。</li>
            </ul>
            <p>房主需先关闭房间，再退出。关闭后不能继续添加任务或加入成员。</p>
          </section>
        </aside>
      </div>
      <Modal
        open={create.draft.open}
        title="创建学习房间"
        dismissOnOutside={false}
        preserveInputFocusOnBlankClick
        description="写清准备方向，方便同伴判断是否适合。"
        onClose={() => {
          if (!write.busy) create.update({ open: false });
        }}
      >
        <form
          className="stack buddy-form"
          onSubmit={(e) => {
            e.preventDefault();
            void write.run(
              "/buddy/rooms",
              "POST",
              {
                name: create.draft.name.trim(),
                description: create.draft.description.trim(),
                capacity: Number(create.draft.capacity),
                visibility: create.draft.visibility,
              },
              () => {
                create.update({
                  name: "",
                  description: "",
                  capacity: "6",
                  visibility: "PUBLIC",
                  open: false,
                });
                setNotice("房间已创建。");
                setTab("mine");
                refresh();
              },
            );
          }}
        >
          <Field label="房间名称" hint="1–100 字，说明学习方向或目标。">
            <input
              className="input"
              disabled={write.busy}
              value={create.draft.name}
              onChange={(e) => create.update({ name: e.target.value })}
              required
              maxLength={100}
              placeholder="例如：前端秋招每周复盘"
            />
          </Field>
          <Field
            label="房间介绍"
            hint="可选，最多 2000 字；建议写明节奏和参与要求。"
          >
            <textarea
              className="input"
              rows={4}
              disabled={write.busy}
              value={create.draft.description}
              maxLength={2000}
              onChange={(e) => create.update({ description: e.target.value })}
              placeholder="例如：每周二交流一道面试题，周末一起复盘。"
            />
          </Field>
          <div className="buddy-form-columns">
            <Field label="人数上限" hint="包含房主，共 2–20 人。">
              <input
                className="input"
                type="number"
                min={2}
                max={20}
                step={1}
                disabled={write.busy}
                value={create.draft.capacity}
                required
                onChange={(e) => create.update({ capacity: e.target.value })}
              />
            </Field>
            <Field
              label="加入方式"
              hint={
                create.draft.visibility === "PUBLIC"
                  ? "公开展示，未满员时可直接加入。"
                  : "仅能通过房主邀请加入。"
              }
            >
              <select
                className="input"
                disabled={write.busy}
                value={create.draft.visibility}
                onChange={(e) =>
                  create.update({
                    visibility: e.target.value as Creation["visibility"],
                  })
                }
              >
                <option value="PUBLIC">公开加入</option>
                <option value="INVITE_ONLY">仅限邀请</option>
              </select>
            </Field>
          </div>
          {write.error && (
            <p className="buddy-error" role="alert">
              {write.error}
            </p>
          )}
          <p className="buddy-help">
            未提交的输入保留在当前浏览器内存中，刷新页面后会丢失。
          </p>
          <div className="buddy-form-footer">
            <Button
              disabled={write.busy}
              onClick={() => create.update({ open: false })}
            >
              暂不创建
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={write.busy || !create.draft.name.trim()}
            >
              {write.busy ? "正在创建…" : "创建房间"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        size="lg"
        title={room?.name ?? "房间详情"}
        dismissOnOutside={false}
        preserveInputFocusOnBlankClick
        open={selected !== null}
        onClose={() => setSelected(null)}
      >
        {room && !rooms.error ? (
          <RoomDetails
            key={room.id}
            room={room}
            owner={owner}
            refresh={refresh}
            close={() => setSelected(null)}
          />
        ) : (
          <div className="buddy-form">
            <ReadState
              loading={rooms.loading}
              error={
                rooms.error ||
                (!rooms.loading ? "你已不在此房间，成员和任务已隐藏。" : "")
              }
              retry={refresh}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
function RoomDetails({
  room,
  owner,
  refresh,
  close,
}: {
  room: Room;
  owner: string;
  refresh: () => void;
  close: () => void;
}) {
  const taskTrigger = useRef<HTMLButtonElement>(null);
  const candidateId = useId();
  const details = useRead(owner, room.id, async (signal) => {
    const [members, tasks] = await Promise.all([
      personalRequest<{ data: Member[] }>(
        `/buddy/rooms/${room.id}/members`,
        "GET",
        undefined,
        signal,
      ),
      personalRequest<{ data: Task[] }>(
        `/buddy/rooms/${room.id}/tasks`,
        "GET",
        undefined,
        signal,
      ),
    ]);
    if (!members.data.some((m) => m.userId === owner))
      throw new Error("你已不在此房间，成员和任务已隐藏。");
    return { members: members.data, tasks: tasks.data };
  });
  const write = useWrite(owner),
    task = useTaskDraft(owner, room.id);
  const [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [confirm, setConfirm] = useState<"close" | "leave" | null>(null),
    [taskError, setTaskError] = useState("");
  const candidates = useRead(
    owner,
    `${room.id}:candidates:${query}`,
    (signal) =>
      query.length >= 2
        ? readAll<Candidate>(
            `/buddy/candidates?q=${encodeURIComponent(query)}`,
            signal,
          )
        : Promise.resolve([]),
  );
  function reload() {
    details.refresh();
    refresh();
  }
  usePoll(details.refresh);
  const isOwner = room.ownerId === owner,
    open = room.state === "OPEN",
    verified = !!details.data,
    tasks = details.data?.tasks ?? [];
  return (
    <div className="buddy-detail">
      <div className="buddy-detail-summary">
        <RoomMeta room={room} />
        <p>{room.description || "房主尚未填写介绍。"}</p>
        <span>我的身份：{isOwner ? "房主" : "成员"}</span>
        <Button variant="ghost" onClick={reload}>
          刷新房间
        </Button>
      </div>
      {notice && (
        <p className="buddy-notice" role="status">
          {notice}
        </p>
      )}
      {write.error && (
        <p className="buddy-error" role="alert">
          {write.error}
        </p>
      )}
      <ReadState {...details} retry={reload} />
      {verified && (
        <>
          <div className="buddy-detail-layout">
            <section className="buddy-tasks">
              <div className="buddy-section-heading">
                <h3>共享任务</h3>
                <span>
                  我已完成 {tasks.filter((t) => t.completedByMe).length} /{" "}
                  {tasks.length}
                </span>
              </div>
              <p className="buddy-help">
                勾选只记录你自己的进度，不改变其他成员的完成情况。
              </p>
              {tasks.length === 0 && (
                <div className="buddy-inline-empty">
                  还没有共享任务。
                  {isOwner && open
                    ? "在下方添加第一个学习目标。"
                    : "等待房主添加学习目标。"}
                </div>
              )}
              <ul className="buddy-task-list">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`完成 ${t.title}`}
                        checked={t.completedByMe}
                        disabled={write.busy || !open}
                        onChange={(e) =>
                          void write.run(
                            `/buddy/rooms/${room.id}/tasks/${t.id}/progress`,
                            "PUT",
                            { completed: e.target.checked },
                            () => details.refresh(),
                          )
                        }
                      />
                      <span>
                        <strong className={t.completedByMe ? "is-done" : ""}>
                          {t.title}
                        </strong>
                        <small>
                          {t.dueAt ? `截止 ${date(t.dueAt)}` : "无截止时间"}
                        </small>
                      </span>
                      {t.completedByMe && (
                        <Check size={16} aria-hidden="true" />
                      )}
                    </label>
                  </li>
                ))}
              </ul>
              {isOwner && open && (
                <div className="buddy-task-entry">
                  <button
                    ref={taskTrigger}
                    type="button"
                    className="button button-secondary"
                    disabled={write.busy || tasks.length >= 100}
                    onClick={() => {
                      write.clear();
                      setTaskError("");
                      task.update({ open: true });
                    }}
                  >
                    <Plus size={15} />
                    添加任务
                  </button>
                  {task.draft.title && (
                    <span className="buddy-help">有未提交的任务草稿</span>
                  )}
                </div>
              )}
            </section>
            <section className="buddy-members">
              <div className="buddy-section-heading">
                <h3>房间成员</h3>
                <span>{details.data!.members.length} 人</span>
              </div>
              <ul>
                {details.data!.members.map((m) => (
                  <li key={m.id}>
                    <div>
                      <strong>{m.displayName}</strong>
                      {m.userId === owner && (
                        <span className="buddy-me">我</span>
                      )}
                      <small>
                        {new Date(m.joinedAt).toLocaleDateString("zh-CN")} 加入
                      </small>
                    </div>
                    <Badge tone={m.role === "OWNER" ? "cyan" : "muted"}>
                      {m.role === "OWNER" ? "房主" : "成员"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          {isOwner && open && (
            <section className="buddy-candidate-section">
              <h3>邀请同伴</h3>
              <p className="buddy-help">
                只搜索自愿公开资料的用户；昵称或方向至少输入 2 个字。
              </p>
              <form
                className="buddy-candidate-search buddy-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (q.trim().length >= 2) {
                    if (query === q.trim()) candidates.refresh();
                    else setQuery(q.trim());
                  }
                }}
              >
                <label className="buddy-candidate-label" htmlFor={candidateId}>
                  昵称或方向
                </label>
                <input
                  id={candidateId}
                  aria-label="昵称或方向"
                  className="input"
                  value={q}
                  maxLength={40}
                  minLength={2}
                  required
                  placeholder="例如：前端"
                  onChange={(e) => {
                    setQ(e.target.value);
                    if (query) setQuery("");
                  }}
                />

                <Button type="submit" disabled={q.trim().length < 2}>
                  <Search size={15} />
                  搜索用户
                </Button>
              </form>
              {query && (
                <>
                  <ReadState {...candidates} retry={candidates.refresh} />
                  {candidates.data?.length === 0 && (
                    <p className="buddy-inline-empty">
                      没有匹配且自愿公开的用户，试试其他昵称或方向。
                    </p>
                  )}
                  {candidates.data?.map((c) => {
                    const member = details.data!.members.some(
                      (m) => m.userId === c.id,
                    );
                    return (
                      <div className="buddy-candidate" key={c.id}>
                        <div>
                          <strong>{c.displayName}</strong>
                          <p>
                            {c.roles.length ? c.roles.join("、") : "未填写方向"}{" "}
                            ·{" "}
                            {c.cities.length
                              ? c.cities.join("、")
                              : "未填写城市"}
                          </p>
                        </div>
                        <Button
                          disabled={write.busy || member}
                          onClick={() =>
                            void write.run(
                              `/buddy/rooms/${room.id}/invitations`,
                              "POST",
                              { inviteeId: c.id },
                              () =>
                                setNotice(`已向 ${c.displayName} 发送邀请。`),
                            )
                          }
                        >
                          {member ? "已在房间" : "发送邀请"}
                        </Button>
                      </div>
                    );
                  })}
                </>
              )}
            </section>
          )}
          <section className="buddy-room-management">
            <div>
              <h3>{isOwner ? "房间管理" : "退出房间"}</h3>
              <p>
                {isOwner && open
                  ? "房主需先关闭房间，才能退出。关闭后停止新成员加入和任务更新。"
                  : "退出后无法查看成员与任务；你的任务完成记录会被移除。"}
              </p>
            </div>
            <div className="buddy-actions">
              {isOwner && open && (
                <Button
                  variant="danger"
                  disabled={write.busy}
                  onClick={() => setConfirm("close")}
                >
                  关闭房间
                </Button>
              )}
              <Button
                variant="danger"
                disabled={write.busy || (isOwner && open)}
                onClick={() => setConfirm("leave")}
              >
                退出房间
              </Button>
            </div>
          </section>
          {confirm && (
            <section
              className="buddy-confirm"
              role="alert"
              aria-label={confirm === "close" ? "确认关闭房间" : "确认退出房间"}
            >
              <h3>
                {confirm === "close"
                  ? "确定关闭这个房间？"
                  : "确定退出这个房间？"}
              </h3>
              <p>
                {confirm === "close"
                  ? "关闭后无法重新开放，待处理邀请将失效，成员仍可查看已有任务。"
                  : "退出后将移除你的任务完成记录，需重新加入才能继续协作。"}
              </p>
              <div className="buddy-actions">
                <Button onClick={() => setConfirm(null)} disabled={write.busy}>
                  取消
                </Button>
                <Button
                  variant="danger"
                  disabled={write.busy}
                  onClick={() =>
                    void write.run(
                      `/buddy/rooms/${room.id}/${confirm}`,
                      "POST",
                      confirm === "close"
                        ? { version: room.version }
                        : undefined,
                      () => {
                        const action = confirm;
                        setConfirm(null);
                        if (action === "leave") {
                          refresh();
                          close();
                        } else {
                          setNotice("房间已关闭，现在可以退出。");
                          reload();
                        }
                      },
                    )
                  }
                >
                  {write.busy
                    ? "正在处理…"
                    : confirm === "close"
                      ? "确认关闭"
                      : "确认退出"}
                </Button>
              </div>
            </section>
          )}
        </>
      )}
      <Modal
        open={!!task.draft.open && verified && isOwner && open}
        title="添加共享任务"
        dismissOnOutside={false}
        preserveInputFocusOnBlankClick
        description="任务由房间成员共享，每个人单独记录完成情况。"
        onClose={() => {
          if (!write.busy) task.update({ open: false });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          taskTrigger.current?.focus({ preventScroll: true });
        }}
      >
        <form
          className="buddy-task-form buddy-task-editor stack buddy-form"
          onSubmit={(e) => {
            e.preventDefault();
            setTaskError("");
            if (
              task.draft.due &&
              !Number.isFinite(new Date(task.draft.due).getTime())
            ) {
              setTaskError("请输入有效的截止日期和时间，或留空。");
              return;
            }
            void write.run(
              `/buddy/rooms/${room.id}/tasks`,
              "POST",
              {
                title: task.draft.title.trim(),
                questionId: null,
                dueAt: task.draft.due
                  ? new Date(task.draft.due).toISOString()
                  : null,
              },
              () => {
                task.update({ title: "", due: "", open: false });
                setNotice("共享任务已添加。");
                details.refresh();
              },
            );
          }}
        >
          {taskError && (
            <p className="buddy-error" role="alert">
              {taskError}
            </p>
          )}
          <Field label="任务名称" hint="1–200 字；每个房间最多 100 项。">
            <input
              className="input"
              required
              maxLength={200}
              disabled={write.busy}
              value={task.draft.title}
              onChange={(e) => task.update({ title: e.target.value })}
              placeholder="例如：整理两道网络协议面试题"
            />
          </Field>
          <Field label="截止时间" hint="可选，按当前设备所在时区输入。">
            <input
              className="input"
              type="datetime-local"
              disabled={write.busy}
              value={task.draft.due}
              onChange={(e) => task.update({ due: e.target.value })}
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            disabled={
              write.busy || !task.draft.title.trim() || tasks.length >= 100
            }
          >
            <Plus size={15} />
            保存任务
          </Button>
        </form>

        {write.error && (
          <p className="buddy-error" role="alert">
            {write.error} 输入已保留，可以重试。
          </p>
        )}
        <p className="buddy-help">
          关闭弹窗会保留当前草稿；刷新页面后草稿会丢失。
        </p>
      </Modal>
    </div>
  );
}
