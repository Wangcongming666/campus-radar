import type { Application, RecruitmentSeason } from '@career-launch/shared'
import { daysUntil, shanghaiDateKey } from '@career-launch/shared'

export type CalendarTone = 'danger' | 'warning' | 'primary' | 'neutral'
export type CalendarEventKind = 'deadline' | 'reminder' | 'season_start' | 'season_end'

export interface CalendarEvent {
  kind: CalendarEventKind
  label: string
  tone: CalendarTone
  applicationId?: string
}

export interface CalendarCell {
  dateKey: string
  day: number
  inMonth: boolean
  isToday: boolean
  events: CalendarEvent[]
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildMonthGrid(year: number, month: number, now = new Date()): Array<Omit<CalendarCell, 'events'>> {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const todayKey = localDateKey(now)
  const cells: Array<Omit<CalendarCell, 'events'>> = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    const dateKey = localDateKey(date)
    cells.push({ dateKey, day: date.getDate(), inMonth: date.getMonth() === month, isToday: dateKey === todayKey })
  }
  return cells
}

export function collectCalendarEvents(applications: Application[], seasons: RecruitmentSeason[], now = new Date()): Map<string, CalendarEvent[]> {
  const events = new Map<string, CalendarEvent[]>()
  const push = (key: string, event: CalendarEvent) => {
    const list = events.get(key) ?? []
    list.push(event)
    events.set(key, list)
  }

  for (const application of applications.filter((item) => !item.archived)) {
    const days = daysUntil(application.deadlineAt, now)
    const tone: CalendarTone = days < 0 ? 'neutral' : days <= 3 ? 'danger' : days <= 7 ? 'warning' : 'primary'
    push(shanghaiDateKey(application.deadlineAt), {
      kind: 'deadline',
      label: `${application.jobTitle} 截止`,
      tone,
      applicationId: application.id,
    })
    for (const reminder of application.reminders) {
      if (reminder.status !== 'scheduled') continue
      push(shanghaiDateKey(reminder.remindAt), {
        kind: 'reminder',
        label: reminder.title,
        tone: daysUntil(reminder.remindAt, now) <= 0 ? 'warning' : 'primary',
        applicationId: application.id,
      })
    }
  }

  for (const season of seasons) {
    push(shanghaiDateKey(season.startsAt), { kind: 'season_start', label: `${season.name} 开始`, tone: 'neutral' })
    push(shanghaiDateKey(season.endsAt), { kind: 'season_end', label: `${season.name} 结束`, tone: 'neutral' })
  }

  return events
}

export function buildCalendar(applications: Application[], seasons: RecruitmentSeason[], year: number, month: number, now = new Date()): CalendarCell[] {
  const events = collectCalendarEvents(applications, seasons, now)
  return buildMonthGrid(year, month, now).map((cell) => ({ ...cell, events: events.get(cell.dateKey) ?? [] }))
}
