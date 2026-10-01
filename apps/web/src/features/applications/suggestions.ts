import type { Application, Job } from '@career-launch/shared'
import { daysUntil } from '@career-launch/shared'

export type SuggestionRule = 'expiring_favorite' | 'confirm' | 'interview_prep' | 'offer_decision' | 'follow_up'

export type SuggestionAction =
  | { kind: 'route'; label: string; to: string }
  | { kind: 'open-application'; label: string; applicationId: string }
  | { kind: 'confirm-application'; label: string; applicationId: string }
  | { kind: 'drop-application'; label: string; applicationId: string }
  | { kind: 'focus-note'; label: string; applicationId: string }

export interface Suggestion {
  id: string
  rule: SuggestionRule
  priority: number
  message: string
  actions: SuggestionAction[]
}

export interface SuggestionInput {
  applications: Application[]
  favoriteJobs: Job[]
  now?: Date
}

const TERMINAL_STAGES = new Set(['offer', 'rejected', 'closed'])

export function buildSuggestions(input: SuggestionInput, dismissed: ReadonlySet<string> = new Set()): Suggestion[] {
  const now = input.now ?? new Date()
  const suggestions: Suggestion[] = []
  const active = input.applications.filter((item) => !item.archived)

  for (const job of input.favoriteJobs) {
    if (job.status !== 'active') continue
    const days = daysUntil(job.deadlineAt, now)
    if (days < 0 || days > 3) continue
    if (active.some((item) => item.jobId === job.id)) continue
    suggestions.push({
      id: `expiring_favorite:${job.id}`,
      rule: 'expiring_favorite',
      priority: 0,
      message: `你收藏的「${job.title}」${days === 0 ? '今天' : days === 1 ? '明天' : `${days} 天后`}就截止了`,
      actions: [{ kind: 'route', label: '去看职位', to: `/jobs/${job.id}` }],
    })
  }

  for (const application of active) {
    const lastEvent = application.events[application.events.length - 1]
    const daysSinceUpdate = lastEvent ? -daysUntil(lastEvent.occurredAt, now) : 0

    if (application.stage === 'pending_confirmation' && daysSinceUpdate > 3) {
      suggestions.push({
        id: `confirm:${application.id}`,
        rule: 'confirm',
        priority: 1,
        message: `「${application.jobTitle}」还在待确认，是想再想想吗？`,
        actions: [
          { kind: 'confirm-application', label: '确认投递', applicationId: application.id },
          { kind: 'drop-application', label: '放弃', applicationId: application.id },
        ],
      })
    }

    if (application.stage === 'interview') {
      suggestions.push({
        id: `interview_prep:${application.id}`,
        rule: 'interview_prep',
        priority: 2,
        message: `「${application.companyName}」的面试在路上了，看看面经提前热身。`,
        actions: [{ kind: 'route', label: '直达面试宝典', to: '/knowledge' }],
      })
    }

    if (application.stage === 'offer') {
      suggestions.push({
        id: `offer_decision:${application.id}`,
        rule: 'offer_decision',
        priority: 2,
        message: `恭喜拿到「${application.companyName}」的 Offer！记得在截止日前回复。`,
        actions: [{ kind: 'focus-note', label: '记录答复', applicationId: application.id }],
      })
    }

    if (application.stage !== 'pending_confirmation' && !TERMINAL_STAGES.has(application.stage) && daysSinceUpdate > 7) {
      suggestions.push({
        id: `follow_up:${application.id}`,
        rule: 'follow_up',
        priority: 3,
        message: `「${application.companyName}」的「${application.jobTitle}」已经 ${daysSinceUpdate} 天没有动静了，发封跟进邮件试试？`,
        actions: [{ kind: 'open-application', label: '查看时间线', applicationId: application.id }],
      })
    }
  }

  return suggestions
    .filter((item) => !dismissed.has(item.id))
    .sort((a, b) => a.priority - b.priority)
}
