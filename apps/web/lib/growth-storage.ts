import { z } from 'zod';
const text = z.string();
const id = z.string().min(1);
const finite = z.number().finite();
const scores = z.record(z.string(), finite.min(0).max(100));
const money = {
  base: finite.positive().max(500),
  months: finite.min(1).max(36),
  bonus: finite.min(0).max(10000),
};
export const offerSchema = z
  .object({
    id,
    company: text,
    title: text,
    city: text,
    ...money,
    deadline: text,
    note: text,
    scores,
  })
  .passthrough();
export const dimensionSchema = z
  .object({ id, name: text, weight: finite.min(0).max(100) })
  .passthrough();
export const subscriptionSchema = z
  .object({
    id,
    name: text,
    role: text,
    city: text,
    company: text,
    type: text,
    education: text,
    keyword: text,
    frequency: text,
    enabled: z.boolean(),
    channels: z.array(text),
    hits: z.array(z.object({ jobId: id, date: text, read: z.boolean() })),
  })
  .passthrough();
export const referralRecordSchema = z
  .object({ id, title: text, companyId: id, contact: text, stage: text, date: text, note: text })
  .passthrough();
export const plannerTaskSchema = z
  .object({
    id,
    title: text,
    milestoneId: text,
    status: z.enum(['待开始', '进行中', '已完成']),
    date: text,
    remind: z.boolean(),
  })
  .passthrough();
export const milestoneSchema = z.object({ id, title: text, date: text }).passthrough();
export const remindedSchema = z.record(z.string(), text);
export const salarySampleSchema = z
  .object({
    id,
    companyId: id,
    role: text,
    city: text,
    ...money,
    year: text,
    level: text,
    source: text,
    note: text,
  })
  .passthrough();
export const resumeRecordSchema = z
  .object({
    id,
    name: text,
    fileName: text,
    mime: text,
    size: finite.min(0),
    text,
    role: text,
    createdAt: text,
    version: finite.int().positive(),
    default: z.boolean(),
    applicationIds: z.array(text),
    extractionNote: text.optional(),
  })
  .passthrough();
export const companyNoteSchema = z
  .object({
    id,
    category: text,
    title: text,
    team: text,
    role: text,
    date: text,
    rating: finite.min(1).max(5),
    body: text,
    tags: text,
    hidden: z.boolean(),
  })
  .passthrough();
export const companyResultSchema = z
  .object({ id, date: text, title: text, role: text, result: text, note: text })
  .passthrough();
export const stringSchema = text;
/** Retain healthy records without allowing damaged or duplicated records into UI/updaters. */
export function cleanLocalRecords<T>(
  raw: unknown,
  schema: z.ZodType<T>,
): { value: T[]; invalid: number } {
  if (!Array.isArray(raw)) return { value: [], invalid: 1 };
  const value: T[] = [],
    seen = new Set<string>();
  let invalid = 0;
  for (const item of raw) {
    const result = schema.safeParse(item);
    if (!result.success) {
      invalid++;
      continue;
    }
    const key =
      result.data && typeof result.data === 'object' && 'id' in result.data ? result.data.id : null;
    if (typeof key === 'string' && seen.has(key)) {
      invalid++;
      continue;
    }
    if (typeof key === 'string') seen.add(key);
    value.push(result.data);
  }
  return { value, invalid };
}
