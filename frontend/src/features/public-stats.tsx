import { useEffect, useState } from "react";
import { fetchPublicStats, type PublicStats } from "../api/public-stats";

export function PublicStats() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchPublicStats(controller.signal).then(setStats).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, []);
  if (error) return <p role="status">公开统计暂时不可用，请稍后重试。</p>;
  if (!stats) return <p role="status">正在加载公开统计…</p>;
  return <p role="status">公开内容：{stats.companies} 家公司 · {stats.openJobs} 个在招岗位 · {stats.experiences} 篇面经 · {stats.questions} 道题</p>;
}
