export interface ScheduledEvent {
  id: number;
  date: string;
  time: string;
  duration: string;
  type: string;
}
/** Intervals are half-open: a meeting ending at 15:00 does not conflict with one starting then. */
export function scheduleConflictIds(events: ScheduledEvent[]): Set<number> {
  const intervals = events
    .filter((e) => e.type !== '截止')
    .map((e) => ({
      id: e.id,
      start: new Date(`${e.date}T${e.time}:00+08:00`).getTime(),
      duration: parseInt(e.duration, 10),
    }))
    .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.duration) && e.duration > 0);
  const conflicts = new Set<number>();
  for (let i = 0; i < intervals.length; i++)
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i],
        b = intervals[j];
      if (a.start < b.start + b.duration * 60000 && b.start < a.start + a.duration * 60000) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  return conflicts;
}
