import { describe, expect, it } from "vitest";
import { calendarDays, dateValue, parseDateValue, shiftCalendarDays, shiftCalendarMonth, todayDateValue } from "./DatePicker";

describe("date picker calendar arithmetic", () => {
  it("rejects impossible dates and accepts leap dates without normalization", () => {
    expect(parseDateValue("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    for (const value of ["2023-02-29", "2100-02-29", "2026-04-31", "2026-00-01", "0000-01-01", "2026-1-01", "", "no date"]) expect(parseDateValue(value)).toBeNull();
    expect(dateValue(parseDateValue("0001-01-01")!)).toBe("0001-01-01");
  });
  it("moves across leap days, year changes and month ends", () => {
    expect(dateValue(shiftCalendarDays({ year: 2024, month: 2, day: 28 }, 1)!)).toBe("2024-02-29");
    expect(dateValue(shiftCalendarDays({ year: 2026, month: 12, day: 31 }, 1)!)).toBe("2027-01-01");
    expect(dateValue(shiftCalendarMonth({ year: 2024, month: 1, day: 31 }, 1))).toBe("2024-02-29");
    expect(dateValue(shiftCalendarMonth({ year: 2024, month: 2, day: 29 }, 12))).toBe("2025-02-28");
    expect(dateValue(shiftCalendarMonth({ year: 2026, month: 1, day: 31 }, -1))).toBe("2025-12-31");
  });
  it("keeps a Monday-first six-week grid, including dates outside the visible month", () => {
    const days = calendarDays(2026, 2);
    expect(days).toHaveLength(42);
    expect(dateValue(days[0]!)).toBe("2026-01-26");
    expect(dateValue(days[41]!)).toBe("2026-03-08");
    expect(calendarDays(2024, 2).filter(day => day?.month === 2)).toHaveLength(29);
  });
  it("bounds navigation at ISO date limits and uses local calendar fields for today", () => {
    expect(shiftCalendarDays({ year: 1, month: 1, day: 1 }, -1)).toBeNull();
    expect(shiftCalendarDays({ year: 9999, month: 12, day: 31 }, 1)).toBeNull();
    expect(calendarDays(9999, 12).filter(Boolean).at(-1)).toEqual({ year: 9999, month: 12, day: 31 });
    expect(todayDateValue(new Date(2026, 0, 2, 0, 15))).toBe("2026-01-02");
  });
});
