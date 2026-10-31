import type { components } from "../api/generated";

export type PracticeQuestion = components["schemas"]["Question"];
export type BankFilter = { count: number; difficulty?: string; topic?: string };

export const difficultyLabels: Record<string, string> = { EASY: "基础", MEDIUM: "进阶", HARD: "挑战" };
const roleLabels: Record<string, string> = {
  frontend: "前端开发", backend: "后端开发", algorithm: "算法与数据结构", product: "产品",
  design: "设计", test: "测试开发", data: "数据分析", operations: "运营",
};
export function bankName(role: string) { return `${Object.hasOwn(roleLabels, role) ? roleLabels[role] : role}题库`; }
export function bankQuestions(questions: PracticeQuestion[], role: string, filter: Omit<BankFilter, "count"> = {}) {
  return [...new Map(questions.map(q => [q.id, q])).values()].filter(q =>
    q.role === role && (!filter.difficulty || q.difficulty === filter.difficulty) && (!filter.topic || q.tags.includes(filter.topic)),
  );
}
export function questionBanks(questions: PracticeQuestion[]) {
  return [...new Set(questions.map(q => q.role))].map(role => {
    const items = bankQuestions(questions, role);
    return { role, name: bankName(role), count: items.length, topics: [...new Set(items.flatMap(q => q.tags))] };
  }).sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function composePractice(questions: PracticeQuestion[], role: string, filter: BankFilter, random = Math.random): PracticeQuestion[] {
  const count = Number.isFinite(filter.count) ? Math.max(0, Math.min(30, Math.trunc(filter.count))) : 0;
  const groups = new Map<string, PracticeQuestion[]>();
  for (const question of bankQuestions(questions, role, filter)) {
    const group = groups.get(question.difficulty) ?? [];
    group.push(question);
    groups.set(question.difficulty, group);
  }
  const queues = shuffled([...groups.values()], random).map(items => shuffled(items, random));
  const selected: PracticeQuestion[] = [];
  while (selected.length < count && queues.some(queue => queue.length)) {
    for (const queue of queues) {
      if (selected.length === count) break;
      const question = queue.shift();
      if (question) selected.push(question);
    }
  }
  return selected;
}
