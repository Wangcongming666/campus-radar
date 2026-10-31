import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import "./date-picker.css";

type CalendarDate = { year: number; month: number; day: number };
// UTC is used only for calendar arithmetic. Values never pass through a timezone conversion.
function calendarTime(date: CalendarDate) {
  const value = new Date(0);
  value.setUTCFullYear(date.year, date.month - 1, date.day);
  value.setUTCHours(12, 0, 0, 0);
  return value;
}
function fromTime(value: Date): CalendarDate {
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}
function monthLength(year: number, month: number) {
  return calendarTime({ year, month: month + 1, day: 0 }).getUTCDate();
}
export function dateValue(date: CalendarDate) {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}
export function parseDateValue(value: string): CalendarDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthLength(year, month) ? { year, month, day } : null;
}
export function todayDateValue(now = new Date()) {
  return dateValue({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}
export function shiftCalendarDays(date: CalendarDate, amount: number): CalendarDate | null {
  const value = calendarTime(date);
  value.setUTCDate(value.getUTCDate() + amount);
  const next = fromTime(value);
  return next.year >= 1 && next.year <= 9999 ? next : null;
}
export function shiftCalendarMonth(date: CalendarDate, amount: number): CalendarDate {
  const index = Math.max(0, Math.min(9999 * 12 - 1, (date.year - 1) * 12 + date.month - 1 + amount));
  const year = Math.floor(index / 12) + 1, month = index % 12 + 1;
  return { year, month, day: Math.min(date.day, monthLength(year, month)) };
}
export function calendarDays(year: number, month: number) {
  const first = { year, month, day: 1 };
  const offset = (calendarTime(first).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => shiftCalendarDays(first, index - offset));
}
const weekDays = ["一", "二", "三", "四", "五", "六", "日"];

export function DatePicker({ label, value, onChange, popoverClassName = "" }: { label: string; value: string; onChange: (value: string) => void; popoverClassName?: string }) {
  const labelId = useId(), valueId = useId(), helpId = useId();
  const selected = parseDateValue(value), today = parseDateValue(todayDateValue())!;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected ?? today);
  const [view, setView] = useState(selected ?? today);
  const [yearDraft, setYearDraft] = useState(String(view.year));
  const [position, setPosition] = useState({ top: 0, left: 12, width: 352 });
  const triggerRef = useRef<HTMLButtonElement>(null), panelRef = useRef<HTMLDivElement>(null);
  const [panelElement, setPanelElement] = useState<HTMLDivElement | null>(null);
  const attachPanel = useCallback((element: HTMLDivElement | null) => { panelRef.current = element; setPanelElement(element); }, []);
  const dayFocus = useRef(false);

  function changeOpen(next: boolean) {
    if (next) {
      const initial = parseDateValue(value) ?? parseDateValue(todayDateValue())!;
      setActive(initial); setView(initial); setYearDraft(String(initial.year));
    }
    setOpen(next);
  }
  function showDate(next: CalendarDate, focusDay = false) {
    dayFocus.current = focusDay;
    setActive(next); setView(next); setYearDraft(String(next.year));
  }
  function choose(next: CalendarDate | null) {
    onChange(next ? dateValue(next) : "");
    setOpen(false);
  }
  function focusActiveDay() {
    panelRef.current?.querySelector<HTMLButtonElement>(`[data-date="${dateValue(active)}"]`)?.focus();
  }
  useEffect(() => {
    if (open && dayFocus.current) { focusActiveDay(); dayFocus.current = false; }
  }, [open, active]);
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      if (!triggerRef.current || !panelRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const width = Math.min(352, window.innerWidth - 24);
      const height = Math.min(panelRef.current.getBoundingClientRect().height, window.innerHeight - 24);
      const below = rect.bottom + 8;
      const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, Math.min(rect.top - height - 8, window.innerHeight - height - 12));
      setPosition({ top, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, panelElement]);
  function dayKey(event: KeyboardEvent<HTMLButtonElement>, date: CalendarDate) {
    if (event.nativeEvent.isComposing) return;
    const weekday = (calendarTime(date).getUTCDay() + 6) % 7;
    let next: CalendarDate | null;
    switch (event.key) {
      case "ArrowLeft": next = shiftCalendarDays(date, -1); break;
      case "ArrowRight": next = shiftCalendarDays(date, 1); break;
      case "ArrowUp": next = shiftCalendarDays(date, -7); break;
      case "ArrowDown": next = shiftCalendarDays(date, 7); break;
      case "Home": next = shiftCalendarDays(date, -weekday); break;
      case "End": next = shiftCalendarDays(date, 6 - weekday); break;
      case "PageUp": next = shiftCalendarMonth(date, event.shiftKey ? -12 : -1); break;
      case "PageDown": next = shiftCalendarMonth(date, event.shiftKey ? 12 : 1); break;
      default: return;
    }
    event.preventDefault();
    if (next) showDate(next, true);
  }
  function commitYear() {
    const numeric = Number(yearDraft);
    if (yearDraft.trim() && Number.isInteger(numeric) && numeric >= 1 && numeric <= 9999) {
      showDate({ year: numeric, month: view.month, day: Math.min(active.day, monthLength(numeric, view.month)) });
    } else setYearDraft(String(view.year));
  }
  const days = calendarDays(view.year, view.month);
  return <div className="field date-picker">
    <span id={labelId}>{label}</span>
    <Dialog.Root open={open} onOpenChange={changeOpen} modal={false}>
      <Dialog.Trigger asChild>
        <button ref={triggerRef} type="button" className="date-picker-trigger" aria-labelledby={`${labelId} ${valueId}`}>
          <span id={valueId}>{value || "请选择日期"}</span><CalendarDays size={18} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content ref={attachPanel} className={`date-picker-popover ${popoverClassName}`} style={position} aria-describedby={helpId}
          onOpenAutoFocus={event => { event.preventDefault(); focusActiveDay(); }}>
          <div className="date-picker-heading">
            <Dialog.Title>{label}</Dialog.Title>
            <Dialog.Close asChild><button type="button" className="date-picker-icon" aria-label="关闭日期选择"><X size={18} aria-hidden="true" /></button></Dialog.Close>
          </div>
          <p id={helpId} className="date-picker-help">选择月份和年份，或用方向键选择日期。</p>
          <div className="date-picker-navigation">
            <button type="button" className="date-picker-icon" aria-label="上个月" disabled={view.year === 1 && view.month === 1} onClick={() => showDate(shiftCalendarMonth(active, -1))}><ChevronLeft size={20} aria-hidden="true" /></button>
            <div className="date-picker-month-year">
              <label><span className="date-picker-sr">年份</span><input aria-label="年份" type="number" inputMode="numeric" min="1" max="9999" value={yearDraft} onChange={event => setYearDraft(event.target.value)} onBlur={commitYear} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitYear(); } }} /><span aria-hidden="true">年</span></label>
              <label><span className="date-picker-sr">月份</span><select aria-label="月份" value={view.month} onChange={event => { const month = Number(event.target.value); showDate({ year: view.year, month, day: Math.min(active.day, monthLength(view.year, month)) }); }}>{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1}月</option>)}</select></label>
            </div>
            <button type="button" className="date-picker-icon" aria-label="下个月" disabled={view.year === 9999 && view.month === 12} onClick={() => showDate(shiftCalendarMonth(active, 1))}><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
          <span className="date-picker-sr" aria-live="polite">{view.year}年{view.month}月</span>
          <div className="date-picker-grid" role="grid" aria-label={`${view.year}年${view.month}月`}>
            <div role="row" className="date-picker-week">{weekDays.map(day => <span role="columnheader" key={day} aria-label={`星期${day}`}>{day}</span>)}</div>
            {Array.from({ length: 6 }, (_, row) => <div role="row" className="date-picker-week" key={row}>
              {days.slice(row * 7, row * 7 + 7).map((day, column) => {
                if (!day) return <span role="gridcell" key={column} />;
                const iso = dateValue(day), isSelected = iso === value, isToday = iso === dateValue(today);
                return <span role="gridcell" key={iso} aria-selected={isSelected}>
                  <button type="button" className="date-picker-day" data-date={iso} data-outside={day.month !== view.month || undefined} data-selected={isSelected || undefined} aria-label={`${day.year}年${day.month}月${day.day}日`} aria-current={isToday ? "date" : undefined} tabIndex={iso === dateValue(active) ? 0 : -1} onFocus={() => setActive(day)} onClick={() => choose(day)} onKeyDown={event => dayKey(event, day)}>{day.day}</button>
                </span>;
              })}
            </div>)}
          </div>
          <div className="date-picker-footer"><button type="button" onClick={() => choose(parseDateValue(todayDateValue()))}>今天</button><span>{value ? `已选 ${value}` : "尚未选择"}</span><button type="button" onClick={() => choose(null)} disabled={!value}>清空</button></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </div>;
}
