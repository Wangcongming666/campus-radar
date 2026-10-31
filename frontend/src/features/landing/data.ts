import { useCallback, useEffect, useState } from "react";
import type { components } from "../../api/generated";
import { fetchPublicStats, type PublicStats } from "../../api/public-stats";
import { apiRequest } from "../../api/auth";
import { useAccount } from "../../app/api-shell";
export type Company = components["schemas"]["Company"];
export type Job = components["schemas"]["Job"];
export type Task = components["schemas"]["PlanTask"];
export type Board = components["schemas"]["Board"];
export type Question = components["schemas"]["Question"];
export type JobPreview = {
  id: string;
  title: string;
  company: string;
  city: string;
  role: string;
  salary: string;
  tags: string[];
};
export function jobPreview(job: Job): JobPreview {
  const salary = job.salary;
  const amount = (value: number | null) =>
    value === null ? "未注明" : `${(value / 100).toLocaleString("zh-CN")} 元`;
  return {
    id: job.id,
    title: job.title,
    company: job.company.name,
    city: job.cities.join(" / ") || "城市未注明",
    role: job.role,
    salary: !salary
      ? "薪资未注明"
      : salary.negotiable
        ? "薪资面议"
        : `${amount(salary.minMinor)}–${amount(salary.maxMinor)} / ${{ MONTH: "月", YEAR: "年", DAY: "天" }[salary.period]}`,
    tags: job.skills.slice(0, 3),
  };
}
export function jobHref(job: JobPreview) {
  return `/jobs/${encodeURIComponent(job.id)}`;
}
export function useLandingData() {
  const { user } = useAccount();
  const [jobs, setJobs] = useState<Job[]>([]),
    [companies, setCompanies] = useState<Company[]>([]),
    [stats, setStats] = useState<PublicStats | null>(null),
    [questions, setQuestions] = useState<Question[]>([]),
    [board, setBoard] = useState<Board | null>(null),
    [tasks, setTasks] = useState<Task[]>([]);
  const [jobsState, setJobsState] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [statsError, setStatsError] = useState(false),
    [companiesError, setCompaniesError] = useState(false),
    [questionsError, setQuestionsError] = useState(false),
    [privateError, setPrivateError] = useState(""),
    [privateLoading, setPrivateLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  useEffect(() => {
    let controller: AbortController | null = null;
    let revision = 0;
    function unavailable() {
      revision++;
      controller?.abort();
      setJobs([]);
      setCompanies([]);
      setStats(null);
      setQuestions([]);
      setBoard(null);
      setTasks([]);
      setJobsState("error");
      setStatsError(true);
      setCompaniesError(true);
      setQuestionsError(true);
      setLastSynced(null);
    }
    async function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const version = ++revision;
      const [j, c, s, q] = await Promise.allSettled([
        apiRequest<Job[]>("/api/v1/jobs?page=1&size=10&status=OPEN", {
          signal,
        }),
        apiRequest<Company[]>("/api/v1/companies?page=1&size=10", { signal }),
        fetchPublicStats(signal),
        apiRequest<Question[]>("/api/v1/questions?page=1&size=3", { signal }),
      ]);
      if (signal.aborted || version !== revision) return;
      setJobs(j.status === "fulfilled" ? j.value : []);
      setJobsState(j.status === "fulfilled" ? "ready" : "error");
      setCompanies(c.status === "fulfilled" ? c.value : []);
      setCompaniesError(c.status !== "fulfilled");
      setStats(s.status === "fulfilled" ? s.value : null);
      setStatsError(s.status !== "fulfilled");
      setLastSynced(s.status === "fulfilled" ? Date.now() : null);
      setQuestions(q.status === "fulfilled" ? q.value : []);
      setQuestionsError(q.status !== "fulfilled");
    }
    const visibleLoad = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("campus:api-unavailable", unavailable);
    window.addEventListener("focus", visibleLoad);
    window.addEventListener("pageshow", visibleLoad);
    document.addEventListener("visibilitychange", visibleLoad);
    void load();
    const timer = window.setInterval(visibleLoad, 10000);
    return () => {
      revision++;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("campus:api-unavailable", unavailable);
      window.removeEventListener("focus", visibleLoad);
      window.removeEventListener("pageshow", visibleLoad);
      document.removeEventListener("visibilitychange", visibleLoad);
    };
  }, []);
  const refreshPrivate = useCallback(
    async (signal?: AbortSignal) => {
      setBoard(null);
      setTasks([]);
      setPrivateError("");
      if (!user || user.role !== "USER") return;
      setPrivateLoading(true);
      try {
        const [b, t] = await Promise.all([
          apiRequest<Board>("/api/v1/applications/board", { signal }),
          apiRequest<Task[]>("/api/v1/planner/tasks?page=1&size=100", {
            signal,
          }),
        ]);
        if (!signal?.aborted) {
          setBoard(b);
          setTasks(t);
        }
      } catch (error) {
        if (!signal?.aborted)
          setPrivateError(
            error instanceof Error ? error.message : "无法读取工作台",
          );
      } finally {
        if (!signal?.aborted) setPrivateLoading(false);
      }
    },
    [user?.id],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refreshPrivate(controller.signal);
    return () => controller.abort();
  }, [refreshPrivate]);
  return {
    user,
    lastSynced,
    jobs,
    companies,
    stats,
    questions,
    questionsError,
    jobsState,
    statsError,
    companiesError,
    previews: jobs.map(jobPreview),
    board,
    tasks,
    setTasks,
    privateError,
    privateLoading,
    refreshPrivate,
  };
}
export type LandingData = ReturnType<typeof useLandingData>;
