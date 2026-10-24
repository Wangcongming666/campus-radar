import { describe, it, expect } from 'vitest';
import { scheduleConflictIds } from './schedule';
const event = (
  id: number,
  time: string,
  duration = '60 分钟',
  date = '2026-10-23',
  type = '面试',
) => ({ id, date, time, duration, type });
describe('interview schedule conflicts', () => {
  it('flags both overlapping appointments', () => {
    expect([...scheduleConflictIds([event(1, '14:00'), event(2, '14:30')])]).toEqual([1, 2]);
  });
  it('allows back-to-back appointments and skips deadline reminders', () => {
    expect(
      scheduleConflictIds([
        event(1, '14:00'),
        event(2, '15:00'),
        event(3, '14:30', '当日截止', '2026-10-23', '截止'),
      ]).size,
    ).toBe(0);
  });
  it('compares absolute times across midnight', () => {
    expect([
      ...scheduleConflictIds([
        event(1, '23:30', '90 分钟'),
        event(2, '00:30', '60 分钟', '2026-10-24'),
      ]),
    ]).toEqual([1, 2]);
  });
});
