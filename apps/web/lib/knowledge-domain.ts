import { companies, type Experience, type Question } from './data';
export type ExperienceDraft = {
  title: string;
  content: string;
  companyId: string;
  role: string;
  round: string;
  tags: string;
};
export type Learning = {
  mastery: Record<string, string>;
  wrong: string[];
  attempts: Record<string, number>;
};
export function validateText(value: string, min: number, max: number) {
  const text = value.trim();
  if (text.length < min || text.length > max) throw new Error(`请填写 ${min} 至 ${max} 字`);
  return text;
}
export function buildExperience(draft: ExperienceDraft, author: string, id: string): Experience {
  const title = validateText(draft.title, 2, 100);
  const content = validateText(draft.content, 10, 20000);
  if (!companies.some((c) => c.id === draft.companyId)) throw new Error('请选择有效企业');
  const tags = [
    ...new Set(
      draft.tags
        .split(/[,，、]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 8 || tags.some((t) => t.length > 20))
    throw new Error('最多 8 个标签，每个不超过 20 字');
  return {
    id,
    title,
    companyId: draft.companyId,
    role: validateText(draft.role, 1, 40),
    round: validateText(draft.round, 1, 20),
    author,
    avatar: author.slice(0, 1),
    tags,
    views: 0,
    likes: 0,
    excerpt: content.slice(0, 100),
    sections: content.split(/\n\s*\n/).map((content, i) => ({ title: `复盘 ${i + 1}`, content })),
    date: new Date().toLocaleDateString('zh-CN'),
    readTime: `${Math.max(1, Math.ceil(content.length / 400))}分钟`,
  };
}
export function summarizeExperience(value: Experience) {
  return value.sections
    .map((section) => {
      const sentences = section.content.match(/[^。！？\n]+[。！？]?/g) ?? [];
      const ranked = [...sentences].sort(
        (a, b) =>
          Number(/改进|问题|考察|项目|结果|优化|注意/.test(b)) -
          Number(/改进|问题|考察|项目|结果|优化|注意/.test(a)),
      );
      return `${section.title}：${ranked.slice(0, 2).join('').slice(0, 280)}`;
    })
    .join('\n');
}
export function questionMatchesRole(q: Question, role: string) {
  return (
    role === '全部方向' ||
    (role === '后端开发'
      ? ['数据库', '计算机网络', '行为面试'].includes(q.topic)
      : q.topic !== '数据库')
  );
}
export function selectPack(
  company: string,
  role: string,
  difficulty: string,
  experiences: Experience[],
  questions: Question[],
) {
  return {
    experiences: experiences.filter(
      (e) => e.companyId === company && (role === '全部方向' || e.role === role),
    ),
    questions: questions.filter(
      (q) =>
        q.companies.includes(company) &&
        questionMatchesRole(q, role) &&
        (difficulty === '全部难度' || q.difficulty === difficulty),
    ),
  };
}
export function assessQuestion(state: Learning, id: string, passed: boolean): Learning {
  return {
    mastery: { ...state.mastery, [id]: passed ? '已掌握' : '学习中' },
    wrong: passed ? state.wrong.filter((x) => x !== id) : [...new Set([...state.wrong, id])],
    attempts: { ...state.attempts, [id]: (state.attempts[id] ?? 0) + 1 },
  };
}
export function joinRoom<T extends { joined: boolean; members: number; capacity: number }>(
  room: T,
): T {
  if (room.joined) return room;
  if (room.members >= room.capacity) throw new Error('这个房间已满');
  return { ...room, joined: true, members: room.members + 1 };
}
export function removeDiscussionThread<T extends { id: string; parent?: string }>(
  comments: T[],
  id: string,
): T[] {
  const deleted = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const comment of comments) {
      if (comment.parent && deleted.has(comment.parent) && !deleted.has(comment.id)) {
        deleted.add(comment.id);
        changed = true;
      }
    }
  }
  return comments.filter((comment) => !deleted.has(comment.id));
}
