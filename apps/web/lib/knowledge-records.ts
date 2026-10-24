import { z } from 'zod';
const text = z.string();
const ids = z.array(text);
const dictionary = z.record(text, text);
const draft = z.object({
  title: text,
  content: text,
  companyId: text,
  role: text,
  round: text,
  tags: text,
});
const experience = z.object({
  id: text,
  companyId: text,
  title: text,
  role: text,
  round: text,
  author: text,
  avatar: text,
  date: text,
  readTime: text,
  tags: ids,
  views: z.number().nonnegative(),
  likes: z.number().nonnegative(),
  excerpt: text,
  sections: z.array(z.object({ title: text, content: text })),
});
const schemas: Record<string, z.ZodType> = {
  'knowledge-experiences': z.array(experience),
  'knowledge-learning': z.object({
    mastery: dictionary,
    wrong: ids,
    attempts: z.record(text, z.number().int().nonnegative()),
  }),
  'knowledge-collections': z.array(
    z.object({ id: text, title: text, questionIds: ids, source: text }),
  ),
  'knowledge-answers': dictionary,
  'experience-summaries': dictionary,
  'experience-likes': ids,
  'handbook-notes': dictionary,
  'handbook-templates': dictionary,
  'buddy-requests': z.array(z.number()),
  'community-draft': z.object({ body: text, tag: text }),
  'community-reports': z.record(text, z.object({ reason: text, date: text })),
  posts: z.array(
    z.object({
      id: z.number(),
      name: text,
      avatar: text,
      time: text,
      body: text,
      tag: text,
      likes: z.number().nonnegative(),
      liked: z.boolean(),
      mine: z.boolean().optional(),
    }),
  ),
  'community-rooms': z.array(
    z.object({
      id: text,
      title: text,
      role: text,
      schedule: text,
      capacity: z.number().int().min(2).max(10),
      members: z.number().int().nonnegative(),
      joined: z.boolean(),
      mine: z.boolean(),
      questionIds: ids,
      notes: z.array(z.object({ id: text, content: text })),
    }),
  ),
};
export function decodeKnowledgeRecord(key: string, raw: string): unknown {
  try {
    const value: unknown = JSON.parse(raw);
    const schema = key.startsWith('knowledge-draft-')
      ? draft
      : key.startsWith('discussion-')
        ? z.array(z.object({ id: text, parent: text.optional(), name: text, content: text }))
        : schemas[key];
    return schema ? schema.parse(value) : value;
  } catch {
    throw new Error('本地记录格式错误。可先在设置中导出数据，再重置本机记录。');
  }
}
