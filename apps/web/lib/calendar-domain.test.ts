import { describe, expect, it } from 'vitest';
import { calendarIcs, validateCalendarEvent, isCalendarEvents } from './calendar-domain';
describe('editable interview calendar', () => {
  it('rejects imported objects and unsafe URLs in optional calendar fields', () => {
    const base = {
      id: 1,
      title: '技术面',
      date: '2026-10-23',
      time: '09:00',
      duration: '60 分钟',
      type: '面试',
      companyId: 'tencent',
    };
    expect(isCalendarEvents([base])).toBe(true);
    expect(isCalendarEvents([{ ...base, notes: {} }])).toBe(false);
    expect(isCalendarEvents([{ ...base, meetingUrl: 'javascript:alert(1)' }])).toBe(false);
  });
  it('rejects rolled dates, invalid durations and unsafe meeting links', () => {
    const base = {
      title: '技术面',
      date: '2026-10-23',
      time: '23:30',
      duration: '60 分钟',
      type: '面试',
    };
    expect(validateCalendarEvent(base)).toBeNull();
    expect(validateCalendarEvent({ ...base, date: '2026-02-30' })).toBeTruthy();
    expect(validateCalendarEvent({ ...base, duration: '0 分钟' })).toBeTruthy();
    expect(validateCalendarEvent({ ...base, meetingUrl: 'javascript:alert(1)' })).toBeTruthy();
  });
  it('exports Shanghai times across midnight and escapes untrusted ICS text', () => {
    const text = calendarIcs([
      {
        id: 9,
        title: '技术面\nBEGIN:BAD',
        date: '2026-12-31',
        time: '23:30',
        duration: '90 分钟',
        type: '面试',
        companyId: 'tencent',
      },
    ]);
    expect(text).toContain('DTSTART;TZID=Asia/Shanghai:20261231T233000');
    expect(text).toContain('DTEND;TZID=Asia/Shanghai:20270101T010000');
    expect(text).toContain('SUMMARY:技术面\\nBEGIN:BAD');
    expect(text).not.toContain('\r\nBEGIN:BAD');
  });
});
