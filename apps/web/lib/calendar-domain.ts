import { z } from 'zod';
export type CalendarEvent = {
  id: number;
  date: string;
  time: string;
  title: string;
  companyId: string;
  type: string;
  duration: string;
  applicationId?: string;
  location?: string;
  meetingUrl?: string;
  notes?: string;
  completed?: boolean;
};
const calendarEventSchema = z.object({
  id: z.number().int().nonnegative(),
  date: z.string(),
  time: z.string(),
  title: z.string(),
  companyId: z.string().max(100),
  type: z.enum(['面试', '笔试', '截止', '其他', '学习']),
  duration: z.string().max(50),
  applicationId: z.string().max(200).optional(),
  location: z.string().max(1000).optional(),
  meetingUrl: z.string().max(2000).optional(),
  notes: z.string().max(50000).optional(),
  completed: z.boolean().optional(),
});
export function isCalendarEvents(value: unknown): value is CalendarEvent[] {
  const result = z.array(calendarEventSchema).max(3000).safeParse(value);
  return result.success && result.data.every((event) => !validateCalendarEvent(event));
}
export function validateCalendarEvent(
  event: Pick<CalendarEvent, 'title' | 'date' | 'time' | 'duration' | 'type'> & {
    meetingUrl?: string;
  },
): string | null {
  if (!event.title.trim() || event.title.length > 160) return '日程标题需要 1–160 个字符。';
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(event.date) ||
    Number.isNaN(Date.parse(event.date)) ||
    new Date(event.date).toISOString().slice(0, 10) !== event.date
  )
    return '请选择有效日期。';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)) return '请选择有效时间。';
  const duration = parseInt(event.duration, 10);
  if (event.type !== '截止' && (!Number.isFinite(duration) || duration < 5 || duration > 480))
    return '时长应为 5–480 分钟。';
  if (event.meetingUrl) {
    try {
      if (!['http:', 'https:'].includes(new URL(event.meetingUrl).protocol))
        return '会议链接仅支持 HTTP/HTTPS。';
    } catch {
      return '请输入完整会议链接。';
    }
  }
  return null;
}
const escapeIcs = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
const localStamp = (date: Date) =>
  new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19).replace(/[-:]/g, '');
export function calendarIcs(events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Campus Radar//Local Calendar//ZH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Shanghai',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z';
  for (const event of events) {
    if (validateCalendarEvent(event)) continue;
    const start = new Date(`${event.date}T${event.time}:00+08:00`);
    lines.push('BEGIN:VEVENT', `UID:campus-${event.id}@local`, `DTSTAMP:${stamp}`);
    if (event.type === '截止') {
      const end = new Date(`${event.date}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      lines.push(
        `DTSTART;VALUE=DATE:${event.date.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`,
      );
    } else
      lines.push(
        `DTSTART;TZID=Asia/Shanghai:${localStamp(start)}`,
        `DTEND;TZID=Asia/Shanghai:${localStamp(new Date(start.getTime() + parseInt(event.duration, 10) * 60000))}`,
      );
    lines.push(
      `SUMMARY:${escapeIcs(event.title)}`,
      `DESCRIPTION:${escapeIcs(event.notes ?? '')}`,
      `LOCATION:${escapeIcs(event.location ?? '')}`,
    );
    if (event.meetingUrl) lines.push(`URL:${event.meetingUrl.replace(/[\r\n]/g, '')}`);
    lines.push('END:VEVENT');
  }
  return [...lines, 'END:VCALENDAR', ''].join('\r\n');
}
