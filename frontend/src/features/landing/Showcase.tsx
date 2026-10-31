import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  Columns3,
  LayoutDashboard,
  ListChecks,
  Radar,
  Search,
} from "lucide-react";
import type { LandingData } from "./data";
import { stageLabels } from "../../api/applications";
import { Reveal } from "./motion";
const tabs = [
  {
    title: "投递有进展",
    description: "从待投递到 Offer，每一步都清晰可见。",
    icon: Columns3,
    path: "/pipeline",
    label: "投递看板",
  },
  {
    title: "准备有节奏",
    description: "把大目标拆成小任务，专注今天这一件事。",
    icon: ListChecks,
    path: "/planner",
    label: "准备清单",
  },
  {
    title: "面试有底气",
    description: "沉淀自己的答案，让下一次表达更从容。",
    icon: BookOpen,
    path: "/questions",
    label: "面经题库",
  },
];
export function Showcase({ data }: { data: LandingData }) {
  const [active, setActive] = useState(0);
  return (
    <section className="cr-section cr-showcase" id="workflow">
      <div className="cr-container">
        <Reveal className="cr-showcase-layout">
          <div className="cr-showcase-copy">
            <h2>
              准备有条理，
              <br />
              前进更从容。
            </h2>
            <p>
              让散落的努力，汇成自己的成长路径。
              <br />
              工作台记录直接读取当前账号与公开题库。
            </p>
            <div
              role="tablist"
              aria-label="工作台功能预览"
              className="cr-showcase-tabs"
            >
              {tabs.map((tab, i) => (
                <button
                  key={tab.title}
                  id={`cr-tab-${i}`}
                  role="tab"
                  aria-selected={active === i}
                  aria-controls="cr-workspace-preview"
                  tabIndex={active === i ? 0 : -1}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    if (
                      [
                        "ArrowDown",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowLeft",
                        "Home",
                        "End",
                      ].includes(e.key)
                    ) {
                      e.preventDefault();
                      const next =
                        e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? 2
                            : (active +
                                (["ArrowDown", "ArrowRight"].includes(e.key)
                                  ? 1
                                  : 2)) %
                              3;
                      setActive(next);
                      document.getElementById(`cr-tab-${next}`)?.focus();
                    }
                  }}
                >
                  <tab.icon />
                  <span>
                    <strong>{tab.title}</strong>
                    <small>{tab.description}</small>
                  </span>
                  <ChevronRight />
                  {active === i && <motion.i layoutId="cr-tab-indicator" />}
                </button>
              ))}
            </div>
            <Link className="cr-text-link" to={tabs[active].path}>
              打开{tabs[active].label}
              <ArrowRight />
            </Link>
          </div>
          <div
            className="cr-showcase-frame"
            id="cr-workspace-preview"
            role="tabpanel"
            aria-labelledby={`cr-tab-${active}`}
          >
            <div className="cr-browser-chrome">
              <div>
                <i />
                <i />
                <i />
              </div>
              <span>
                <Radar /> campus radar / workspace
              </span>
              <span>实时记录</span>
            </div>
            <div className="cr-workspace-snapshot">
              <aside>
                <Radar />
                <span className="cr-workspace-user">
                  {data.user?.displayName.slice(0, 1) || <Radar />}
                </span>
                {[
                  LayoutDashboard,
                  Columns3,
                  CalendarDays,
                  BookOpen,
                  ListChecks,
                ].map((Icon, i) => (
                  <span key={i}>
                    <Icon />
                  </span>
                ))}
              </aside>
              <div className="cr-workspace-content">
                <div className="cr-workspace-top">
                  <span>我的工作台 / {tabs[active].label}</span>
                  <span>
                    <Search />
                    {data.user?.displayName ?? "游客"}
                  </span>
                </div>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={active}
                    className="cr-workspace-screen"
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h3>{tabs[active].label}</h3>
                    {active < 2 ? (
                      !data.user ? (
                        <div className="cr-real-empty">
                          <p>登录后查看自己的求职记录。</p>
                          <Link
                            to={`/login?returnTo=${encodeURIComponent(tabs[active].path)}`}
                          >
                            前往登录 <ArrowRight />
                          </Link>
                        </div>
                      ) : data.privateLoading ? (
                        <p className="cr-mini-empty">正在读取工作台…</p>
                      ) : data.privateError ? (
                        <p role="alert">{data.privateError}</p>
                      ) : active === 0 ? (
                        <>
                          <div className="cr-screen-stats">
                            {[
                              [data.board?.stats.total ?? 0, "投递记录"],
                              [
                                data.board?.stats.interviewing ?? 0,
                                "面试进行中",
                              ],
                              [data.board?.stats.offers ?? 0, "收到 Offer"],
                            ].map(([n, t]) => (
                              <div key={t}>
                                <strong>{n}</strong>
                                <span>{t}</span>
                              </div>
                            ))}
                          </div>
                          {data.board?.items.length ? (
                            <div className="cr-live-records">
                              {data.board.items.slice(0, 4).map((app) => (
                                <Link key={app.id} to="/pipeline">
                                  <span>{app.job.company.name}</span>
                                  <strong>{app.job.title}</strong>
                                  <small>{stageLabels[app.stage]}</small>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <div className="cr-real-empty">
                              <p>暂无投递记录。</p>
                              <Link to="/jobs">
                                去发现岗位 <ArrowRight />
                              </Link>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="cr-live-records">
                          {data.tasks.length ? (
                            data.tasks.slice(0, 4).map((task) => (
                              <Link key={task.id} to="/planner">
                                <span>
                                  {task.status === "DONE" ? (
                                    <Check />
                                  ) : (
                                    <ListChecks />
                                  )}
                                </span>
                                <strong>{task.title}</strong>
                                <small>
                                  {task.status === "DONE"
                                    ? "已完成"
                                    : task.status === "DOING"
                                      ? "进行中"
                                      : "待准备"}
                                </small>
                              </Link>
                            ))
                          ) : (
                            <div className="cr-real-empty">
                              <p>暂无准备任务。</p>
                              <Link to="/planner">
                                创建任务 <ArrowRight />
                              </Link>
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <div className="cr-live-records">
                        {data.questionsError ? (
                          <p className="cr-mini-empty">题库暂时不可用。</p>
                        ) : data.questions.length ? (
                          data.questions.map((question) => (
                            <Link to="/questions" key={question.id}>
                              <BookOpen />
                              <strong>{question.title}</strong>
                              <ChevronRight />
                            </Link>
                          ))
                        ) : (
                          <p className="cr-mini-empty">暂无已发布的题目。</p>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            <div className="cr-showcase-foot">
              <span>
                <span className="cr-live-dot" /> 后端实时数据
              </span>
              <span>只展示当前账号可访问的内容</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
