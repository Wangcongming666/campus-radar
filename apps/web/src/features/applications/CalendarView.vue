<script setup lang="ts">
import type { Application, RecruitmentSeason } from '@career-launch/shared'
import { computed, onMounted, ref } from 'vue'
import { repository } from '../../services/repository'
import { buildCalendar, type CalendarCell, type CalendarEventKind } from './calendar'

const props = defineProps<{ applications: Application[] }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth())
const seasons = ref<RecruitmentSeason[]>([])
const selectedDateKey = ref<string | null>(null)

onMounted(async () => {
  seasons.value = await repository.admin.seasons.list()
})

const cells = computed<CalendarCell[]>(() => buildCalendar(props.applications, seasons.value, year.value, month.value, now))

const monthLabel = computed(() => `${year.value} 年 ${month.value + 1} 月`)

const selectedCell = computed(() => cells.value.find((cell) => cell.dateKey === selectedDateKey.value) ?? null)

function shiftMonth(delta: number) {
  const next = new Date(year.value, month.value + delta, 1)
  year.value = next.getFullYear()
  month.value = next.getMonth()
  selectedDateKey.value = null
}

function goToday() {
  year.value = now.getFullYear()
  month.value = now.getMonth()
  selectedDateKey.value = null
}

const WEEKDAY_HEADERS = ['日', '一', '二', '三', '四', '五', '六']

const KIND_LABELS: Record<CalendarEventKind, string> = {
  deadline: '截止',
  reminder: '提醒',
  season_start: '开始',
  season_end: '结束',
}
</script>
<template>
  <div class="calendar-head">
    <h2>{{ monthLabel }}</h2>
    <div class="calendar-nav">
      <button class="quiet" type="button" aria-label="上个月" @click="shiftMonth(-1)">‹</button>
      <button class="quiet" type="button" @click="goToday">回到今天</button>
      <button class="quiet" type="button" aria-label="下个月" @click="shiftMonth(1)">›</button>
    </div>
  </div>

  <div class="calendar-grid" role="grid" aria-label="投递日历">
    <span v-for="weekday in WEEKDAY_HEADERS" :key="weekday" class="weekday" role="columnheader">{{ weekday }}</span>
    <button
      v-for="cell in cells"
      :key="cell.dateKey"
      type="button"
      role="gridcell"
      class="day"
      :class="{ outside: !cell.inMonth, today: cell.isToday, selected: selectedDateKey === cell.dateKey }"
      :aria-label="`${cell.dateKey}${cell.events.length ? `，${cell.events.length} 个日程` : ''}`"
      @click="selectedDateKey = selectedDateKey === cell.dateKey ? null : cell.dateKey"
    >
      <span class="day-number">{{ cell.day }}</span>
      <span class="event-dots" aria-hidden="true">
        <i v-for="event in cell.events.slice(0, 3)" :key="event.kind + event.label" :class="event.tone" />
      </span>
      <span class="event-labels" aria-hidden="true">
        <em v-for="event in cell.events.slice(0, 2)" :key="event.kind + event.label" :class="event.tone">{{ event.label }}</em>
      </span>
    </button>
  </div>

  <section v-if="selectedCell" class="day-panel" :aria-label="`${selectedCell.dateKey} 的日程`">
    <h3>{{ selectedCell.dateKey }}</h3>
    <ul v-if="selectedCell.events.length">
      <li v-for="event in selectedCell.events" :key="event.kind + event.label" :class="event.tone">
        <span class="event-kind">{{ KIND_LABELS[event.kind] }}</span>
        <span>{{ event.label }}</span>
        <button
          v-if="event.applicationId"
          class="quiet"
          type="button"
          @click="emit('open-application', { id: event.applicationId })"
        >查看投递</button>
      </li>
    </ul>
    <p v-else>这天没有安排。点击其他日期查看日程。</p>
  </section>
  <p v-else class="day-panel-hint">点击有圆点的日期查看当天安排。</p>
</template>
<style scoped>
.calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.calendar-head h2{margin:0;font-size:18px}
.calendar-nav{display:flex;gap:6px}
.calendar-nav .quiet{min-height:34px;padding:0 12px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:var(--cl-surface)}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.weekday{padding:6px 0;text-align:center;color:var(--cl-muted);font-size:12px;font-weight:600}
.day{display:grid;grid-template-rows:auto auto 1fr;gap:4px;min-height:86px;padding:8px;border:1px solid var(--cl-border);border-radius:9px;background:var(--cl-surface);text-align:left}
.day.outside{opacity:.45}
.day.today{border-color:var(--cl-primary)}
.day.selected{outline:2px solid var(--cl-primary);outline-offset:1px}
.day-number{font-size:13px;font-weight:600}
.event-dots{display:flex;gap:3px}
.event-dots i{width:6px;height:6px;border-radius:50%}
.event-labels{display:grid;gap:2px}
.event-labels em{overflow:hidden;padding:1px 5px;border-radius:5px;font-size:10px;font-style:normal;text-overflow:ellipsis;white-space:nowrap}
i.danger,em.danger{background:color-mix(in srgb,#f04438 16%,transparent);color:#b42318}
i.warning,em.warning{background:color-mix(in srgb,#f79009 18%,transparent);color:#b54708}
i.primary,em.primary{background:var(--cl-primary-soft);color:var(--cl-primary)}
i.neutral,em.neutral{background:var(--cl-border);color:var(--cl-muted)}
.day-panel{margin-top:16px;padding:16px 18px;border-radius:11px;background:var(--cl-surface)}
.day-panel h3{margin:0 0 10px;font-size:14px}
.day-panel ul{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.day-panel li{display:flex;align-items:center;gap:10px;font-size:13px}
.day-panel li.danger{color:#b42318}
.day-panel li.warning{color:#b54708}
.event-kind{padding:1px 8px;border-radius:6px;background:var(--cl-border);color:var(--cl-muted);font-size:11px}
.day-panel .quiet{min-height:30px;padding:0 10px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:transparent}
.day-panel-hint{margin-top:14px;color:var(--cl-muted);font-size:13px}
@media(max-width:650px){.day{min-height:52px}.event-labels{display:none}}
</style>
