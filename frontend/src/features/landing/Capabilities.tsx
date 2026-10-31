import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CheckCheck,
  ChevronRight,
  GripVertical,
  LayoutDashboard,
  ListChecks,
  MapPin,
} from "lucide-react";
import { apiRequest } from "../../api/auth";
import {
  moveApplication,
  type Application,
  type ApplicationStage,
} from "../../api/applications";
import {
  jobHref,
  jobPreview,
  type Job,
  type JobPreview,
  type LandingData,
} from "./data";
import { Counter, Reveal, Spotlight } from "./motion";
export function Capabilities({ data }: { data: LandingData }) {
  return (
    <section className="cr-section cr-capabilities" id="features">
      <div className="cr-container">
        <Reveal className="cr-section-head">
          <div>
            <span className="cr-eyebrow">不止发现机会，更陪你走完每一步</span>
            <h2>把准备，变成看得见的积累。</h2>
          </div>
          <p>
            从公开岗位到个人进展，
            <br />
            所有记录都来自你的求职工作台。
          </p>
        </Reveal>
        <div className="cr-bento">
          <JobsFeature />
          <BoardFeature data={data} />
          <ChecklistFeature data={data} />
          <QuestionFeature data={data} />
        </div>
      </div>
    </section>
  );
}
function JobsFeature() {
  const [city, setCity] = useState(""),
    [role, setRole] = useState("");
  const [jobs, setJobs] = useState<JobPreview[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      page: "1",
      size: "2",
      status: "OPEN",
    });
    if (city) params.set("city", city);
    if (role) params.set("role", role);
    setLoading(true);
    setError(false);
    apiRequest<Job[]>(`/api/v1/jobs?${params}`, { signal: controller.signal })
      .then((rows) => setJobs(rows.map(jobPreview)))
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(true);
          setJobs([]);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [city, role]);
  const params = new URLSearchParams();
  if (city) params.set("city", city);
  if (role) params.set("role", role);
  return (
    <Reveal className="cr-feature-wrap cr-feature-jobs">
      <Spotlight>
        <div className="cr-feature-heading">
          <span className="cr-icon-tile">
            <BriefcaseBusiness />
          </span>
          <Link to="/jobs" aria-label="打开岗位广场">
            <ArrowUpRight />
          </Link>
        </div>
        <span className="cr-feature-caption">DISCOVER / 01</span>
        <h3>岗位广场</h3>
        <p>按城市与方向，发现值得认真准备的机会。</p>
        <div className="cr-filter-preview">
          <div className="cr-preview-title">
            <strong>发现你的下一站</strong>
            <span>公开岗位</span>
          </div>
          <div className="cr-preview-filters">
            <label>
              <MapPin />
              城市
              <select
                aria-label="预览工作城市"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                <option value="">全部城市</option>
                {["北京", "上海", "杭州", "深圳"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              <BriefcaseBusiness />
              方向
              <select
                aria-label="预览岗位方向"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">全部方向</option>
                <option value="frontend">前端开发</option>
                <option value="backend">后端开发</option>
                <option value="algorithm">算法</option>
                <option value="product">产品</option>
                <option value="design">设计</option>
              </select>
            </label>
          </div>
          <div className="cr-mini-jobs" aria-live="polite">
            {loading ? (
              <p className="cr-mini-empty">正在筛选岗位…</p>
            ) : jobs.length ? (
              jobs.map((job) => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="cr-mini-job"
                  key={job.id}
                >
                  <span className={`cr-company-letter cr-tone-${job.role}`}>
                    {job.company.slice(0, 1)}
                  </span>
                  <div>
                    <Link to={jobHref(job)}>{job.title}</Link>
                    <small>
                      {job.company} · {job.city}
                    </small>
                  </div>
                  <ChevronRight />
                </motion.div>
              ))
            ) : (
              <p className="cr-mini-empty">
                {error ? "岗位服务暂时不可用。" : "暂无符合条件的岗位。"}
              </p>
            )}
          </div>
          <Link
            className="cr-preview-all"
            to={`/jobs${params.size ? `?${params}` : ""}`}
          >
            查看筛选结果 <ArrowRight />
          </Link>
        </div>
        <div className="cr-discovery-paths">
          <span>从一个心动的方向开始</span>
          <div>
            {[
              ["技术研发", "backend"],
              ["产品与设计", "product"],
              ["人工智能", "algorithm"],
            ].map(([label, value]) => (
              <Link key={value} to={`/jobs?role=${value}`}>
                {label}
                <ArrowUpRight />
              </Link>
            ))}
          </div>
          <p>
            <Check />
            公开岗位信息 <Check />
            多维条件筛选
          </p>
        </div>
      </Spotlight>
    </Reveal>
  );
}
function PrivateState({ data, path }: { data: LandingData; path: string }) {
  return !data.user ? (
    <p className="cr-mini-empty">
      <Link to={`/login?returnTo=${encodeURIComponent(path)}`}>
        登录后查看你的记录 <ArrowRight />
      </Link>
    </p>
  ) : data.privateLoading ? (
    <p className="cr-mini-empty">正在读取工作台…</p>
  ) : data.privateError ? (
    <p className="cr-mini-empty" role="alert">
      {data.privateError}
    </p>
  ) : null;
}
const groups = [
  { label: "待投递", target: "PENDING" },
  { label: "进行中", target: "INTERVIEW_1" },
  { label: "已拿 Offer", target: "OFFER" },
] as const;
function groupIndex(app: Application) {
  return app.stage === "PENDING" ? 0 : app.stage === "OFFER" ? 2 : 1;
}
function BoardFeature({ data }: { data: LandingData }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const cards = (data.board?.items ?? []).filter(
    (app) => app.stage !== "CLOSED",
  );
  async function move(app: Application, stage: ApplicationStage) {
    if (!data.board || busy || app.stage === stage) return;
    setBusy(true);
    setError("");
    try {
      await moveApplication(app.id, {
        version: app.version,
        boardVersion: data.board.boardVersion,
        stage,
        beforeId: null,
        afterId: null,
        closedReason: null,
      });
      await data.refreshPrivate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
      await data.refreshPrivate();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Reveal className="cr-feature-wrap cr-feature-board">
      <Spotlight>
        <div className="cr-feature-heading">
          <span className="cr-icon-tile">
            <LayoutDashboard />
          </span>
          <Link to="/pipeline" aria-label="打开投递看板">
            <ArrowUpRight />
          </Link>
        </div>
        <span className="cr-feature-caption">ORGANIZE / 02</span>
        <h3>每一份期待，都有进展。</h3>
        <p>查看真实投递进展，拖动卡片会保存到你的账号。</p>
        <PrivateState data={data} path="/pipeline" />
        {data.user && data.board && (
          <>
            <div className="cr-board-columns">
              {groups.map((group, index) => (
                <div
                  className={`cr-board-column cr-stage-${index}`}
                  key={group.label}
                  ref={(node) => {
                    columns.current[index] = node;
                  }}
                >
                  <div className="cr-column-title">
                    <i />
                    {group.label}
                    <span>
                      {cards.filter((app) => groupIndex(app) === index).length}
                    </span>
                  </div>
                  <div className="cr-board-slot">
                    {cards
                      .filter((app) => groupIndex(app) === index)
                      .slice(0, 2)
                      .map((app) => (
                        <motion.div
                          className="cr-board-card"
                          layout
                          key={app.id}
                          drag={!busy && !data.board?.truncated}
                          dragSnapToOrigin
                          dragMomentum={false}
                          whileDrag={{ scale: 1.04, zIndex: 20 }}
                          onDragEnd={(_, info) => {
                            const point = {
                              x: info.point.x - window.scrollX,
                              y: info.point.y - window.scrollY,
                            };
                            const target = columns.current.findIndex((col) => {
                              const rect = col?.getBoundingClientRect();
                              return (
                                rect &&
                                point.x >= rect.left &&
                                point.x <= rect.right &&
                                point.y >= rect.top - 40 &&
                                point.y <= rect.bottom + 40
                              );
                            });
                            if (target >= 0)
                              void move(app, groups[target].target);
                          }}
                        >
                          <div>
                            <span>{app.job.company.name}</span>
                            <GripVertical />
                          </div>
                          <strong>{app.job.title}</strong>
                          <Link to="/pipeline">
                            管理投递 <ArrowRight />
                          </Link>
                        </motion.div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
            {!cards.length && (
              <p className="cr-mini-empty">
                暂无投递记录，去岗位广场添加第一份投递。
              </p>
            )}
            <div className="cr-board-note">
              <span>全部记录以完整看板为准</span>
              <Link to="/pipeline">打开投递看板 →</Link>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="cr-error">
            {error}
          </p>
        )}
      </Spotlight>
    </Reveal>
  );
}
function ChecklistFeature({ data }: { data: LandingData }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const done = data.tasks.filter((task) => task.status === "DONE").length;
  async function toggle(id: string) {
    const task = data.tasks.find((item) => item.id === id);
    if (!task || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await apiRequest<typeof task>(
        `/api/v1/planner/tasks/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            version: task.version,
            status: task.status === "DONE" ? "TODO" : "DONE",
          }),
        },
      );
      data.setTasks((items) =>
        items.map((item) => (item.id === id ? updated : item)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Reveal className="cr-feature-wrap cr-feature-checklist">
      <Spotlight>
        <div className="cr-feature-heading">
          <span className="cr-icon-tile">
            <ListChecks />
          </span>
          <Link to="/planner" aria-label="打开准备清单">
            <ArrowUpRight />
          </Link>
        </div>
        <span className="cr-feature-caption">PREPARE / 03</span>
        <h3>今天，也更近一步。</h3>
        <p>你的准备任务，完成后实时保存。</p>
        <PrivateState data={data} path="/planner" />
        {data.user && !data.privateLoading && !data.privateError && (
          <>
            {data.tasks.length ? (
              <div className="cr-checklist">
                {data.tasks.slice(0, 3).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    role="checkbox"
                    aria-checked={task.status === "DONE"}
                    disabled={busy}
                    onClick={() => void toggle(task.id)}
                  >
                    <span className={task.status === "DONE" ? "checked" : ""}>
                      {task.status === "DONE" && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                        >
                          <Check />
                        </motion.span>
                      )}
                    </span>
                    <span className={task.status === "DONE" ? "is-done" : ""}>
                      {task.title}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="cr-mini-empty">
                暂无准备任务，<Link to="/planner">创建第一项任务</Link>。
              </p>
            )}
            <div className="cr-progress-label">
              <span>当前读取任务的完成进度</span>
              <strong>
                {done} / {data.tasks.length}
              </strong>
            </div>
            <div
              className="cr-progress-track"
              role="progressbar"
              aria-label="准备任务完成度"
              aria-valuemin={0}
              aria-valuemax={data.tasks.length || 1}
              aria-valuenow={done}
            >
              <motion.div
                animate={{
                  width: `${data.tasks.length ? (done / data.tasks.length) * 100 : 0}%`,
                }}
              />
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="cr-error">
            {error}
          </p>
        )}
      </Spotlight>
    </Reveal>
  );
}
function QuestionFeature({ data }: { data: LandingData }) {
  return (
    <Reveal className="cr-feature-wrap cr-feature-questions">
      <Spotlight>
        <div className="cr-feature-heading">
          <span className="cr-icon-tile">
            <BookOpen />
          </span>
          <CheckCheck className="cr-questions-art" />
        </div>
        <span className="cr-feature-caption">PRACTICE / 04</span>
        <h3>把问题，变成底气。</h3>
        <p>
          面经、题库与知识笔记，
          <br />
          让每一次思考都有回响。
        </p>
        <div className="cr-question-count">
          <strong>
            {data.stats ? <Counter value={data.stats.questions} /> : "—"}
          </strong>
          <span>道已发布面试题</span>
        </div>
        <div className="cr-question-tags">
          <Link to="/questions">技术基础</Link>
          <Link to="/experiences">面试经验</Link>
          <Link to="/handbook">知识宝典</Link>
        </div>
        <Link className="cr-button cr-button-gradient" to="/questions">
          开始练习 <ArrowRight />
        </Link>
      </Spotlight>
    </Reveal>
  );
}
