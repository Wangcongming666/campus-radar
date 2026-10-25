import { z } from 'zod';
import { jobs } from './data';
const stage = z.enum([
  'PENDING',
  'APPLIED',
  'ASSESSMENT',
  'INTERVIEW_1',
  'INTERVIEW_2',
  'HR',
  'OFFER',
  'CLOSED',
]);
export const applicationSchema = z.object({
  id: z.string().min(1).max(120),
  jobId: z
    .string()
    .min(1)
    .max(120)
    .refine(
      (id) =>
        z.uuid().safeParse(id).success ||
        (process.env.NEXT_PUBLIC_DATA_MODE !== 'api' && jobs.some((job) => job.id === id)),
    ),
  stage,
  notes: z.string().max(50_000),
  date: z.string().max(50),
  version: z.number().int().positive(),
  archived: z.boolean().optional(),
  resumeId: z.string().max(120).optional(),
  appliedAt: z.string().max(100).optional(),
  updatedAt: z.string().max(100).optional(),
  history: z
    .array(z.object({ id: z.string().max(150), from: stage, to: stage, at: z.string().max(100) }))
    .max(1000)
    .optional(),
});
export const notificationSchema = z.object({
  id: z.string().max(120),
  title: z.string().max(300),
  content: z.string().max(10_000),
  category: z.enum(['面试提醒', '岗位动态', '学习提醒', '系统通知']),
  href: z
    .string()
    .max(1000)
    .refine((href) => href.startsWith('/') && !href.startsWith('//') && !/[\\\r\n]/.test(href)),
  action: z.string().max(100),
  date: z.string().max(150),
});
export const workspaceSchema = z.object({
  favorites: z.array(z.string().max(160)).max(10_000),
  applications: z.array(applicationSchema).max(10_000),
  notes: z.record(z.string().max(200), z.string().max(500_000)),
  completed: z.array(z.string().max(120)).max(10_000),
  userName: z.string().min(1).max(40),
  profileComplete: z.boolean(),
  notifications: z.array(notificationSchema).max(300).default([]),
});
