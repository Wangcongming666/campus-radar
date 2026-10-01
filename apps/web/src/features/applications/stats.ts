import type { Application, ApplicationStage } from '@career-launch/shared'
import { daysUntil, shanghaiDateKey } from '@career-launch/shared'
import { stageMeta } from './stages'

export interface StageCount {
  stage: ApplicationStage
  label: string
  count: number
}

export interface DayCount {
  dateKey: string
  weekday: string
  count: number
}

export interface WorkspaceStats {
  funnel: StageCount[]
  weekly: DayCount[]
  keyNumbers: { interviewing: number; offers: number; needsFollowUp: number }
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const TERMINAL_STAGES = new Set<ApplicationStage>(['offer', 'rejected', 'closed'])

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function appliedDateKey(application: Application): string | null {
  const appliedAt = application.appliedAt ?? application.events[0]?.occurredAt
  return appliedAt ? shanghaiDateKey(appliedAt) : null
}

export function buildStats(applications: Application[], now = new Date()): WorkspaceStats {
  const active = applications.filter((item) => !item.archived)

  const funnel = (Object.keys(stageMeta) as ApplicationStage[]).map((stage) => ({
    stage,
    label: stageMeta[stage]?.label ?? stage,
    count: active.filter((item) => item.stage === stage).length,
  }))

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekly: DayCount[] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(today)
    day.setDate(day.getDate() - offset)
    weekly.push({ dateKey: localDateKey(day), weekday: WEEKDAY_LABELS[day.getDay()] ?? '', count: 0 })
  }
  const weeklyByDate = new Map(weekly.map((entry) => [entry.dateKey, entry]))
  for (const application of active) {
    const entry = weeklyByDate.get(appliedDateKey(application) ?? '')
    if (entry) entry.count += 1
  }

  const keyNumbers = {
    interviewing: active.filter((item) => item.stage === 'interview').length,
    offers: active.filter((item) => item.stage === 'offer').length,
    needsFollowUp: active.filter((item) => {
      if (item.stage === 'pending_confirmation' || TERMINAL_STAGES.has(item.stage)) return false
      const lastEvent = item.events[item.events.length - 1]
      return lastEvent ? -daysUntil(lastEvent.occurredAt, now) > 7 : false
    }).length,
  }

  return { funnel, weekly, keyNumbers }
}
