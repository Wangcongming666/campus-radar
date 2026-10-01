import type { JobQuery } from './domain'

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000
const DAY_MS = 24 * 60 * 60 * 1_000

function shanghaiDay(value: Date): number {
  return Math.floor((value.getTime() + SHANGHAI_OFFSET_MS) / DAY_MS)
}

export function formatDeadline(value: string, now = new Date()): string {
  const remaining = shanghaiDay(new Date(value)) - shanghaiDay(now)

  if (remaining < 0) return '已截止'
  if (remaining === 0) return '今天截止'
  return `${remaining}天后截止`
}

export function daysUntil(value: string, now = new Date()): number {
  return shanghaiDay(new Date(value)) - shanghaiDay(now)
}

export interface DeadlineStatus {
  days: number
  label: string
  tone: 'danger' | 'warning' | 'primary' | 'neutral'
}

export function formatDeadlineStatus(value: string, now = new Date()): DeadlineStatus {
  const days = daysUntil(value, now)
  if (days < 0) return { days, label: `已过期 ${-days} 天`, tone: 'danger' }
  if (days <= 3) return { days, label: days === 0 ? '今天截止' : `${days} 天后截止`, tone: 'danger' }
  if (days <= 7) return { days, label: `${days} 天后截止`, tone: 'warning' }
  return { days, label: `${days} 天后截止`, tone: 'primary' }
}

export function shanghaiDateKey(value: string): string {
  return new Date(Date.parse(value) + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10)
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parseJobQuery(input: URLSearchParams): JobQuery {
  const keyword = input.get('keyword')?.trim()
  const seasonId = input.get('seasonId')?.trim()
  const sort = input.get('sort') === 'deadline' ? 'deadline' : 'latest'

  return {
    ...(keyword ? { keyword } : {}),
    city: input.getAll('city').filter(Boolean),
    category: input.getAll('category').filter(Boolean),
    education: input.getAll('education').filter(Boolean),
    ...(seasonId ? { seasonId } : {}),
    sort,
    page: positiveInteger(input.get('page'), 1),
    pageSize: positiveInteger(input.get('pageSize'), 12),
  }
}

export function serializeJobQuery(query: JobQuery): URLSearchParams {
  const output = new URLSearchParams()

  if (query.keyword?.trim()) output.set('keyword', query.keyword.trim())
  query.city.forEach((value) => output.append('city', value))
  query.category.forEach((value) => output.append('category', value))
  query.education.forEach((value) => output.append('education', value))
  if (query.seasonId) output.set('seasonId', query.seasonId)
  if (query.sort !== 'latest') output.set('sort', query.sort)
  if (query.page !== 1) output.set('page', String(query.page))
  if (query.pageSize !== 12) output.set('pageSize', String(query.pageSize))

  return output
}
