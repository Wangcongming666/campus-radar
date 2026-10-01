<script setup lang="ts">
import type { Application, Job } from '@career-launch/shared'
import { daysUntil } from '@career-launch/shared'
import { EmptyState } from '@career-launch/ui'
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { repository } from '../../services/repository'
import type { Suggestion, SuggestionAction } from './suggestions'
import { buildSuggestions } from './suggestions'
import { buildStats } from './stats'

const props = defineProps<{ applications: Application[] }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()
const reload = inject<() => void>('reloadApplications', () => {})
const router = useRouter()

const favoriteJobs = ref<Job[]>([])
const dismissed = ref(new Set<string>())
const pendingDropId = ref<string | null>(null)

onMounted(async () => {
  await repository.applications.syncDueReminders()
  const page = await repository.jobs.list({ city: [], category: [], education: [], sort: 'deadline', page: 1, pageSize: 100, favorite: true })
  favoriteJobs.value = page.items.filter((job) => job.status === 'active')
})

const suggestions = computed(() => buildSuggestions({ applications: props.applications, favoriteJobs: favoriteJobs.value }, dismissed.value))

const visibleSuggestions = computed(() => suggestions.value.slice(0, 5))
const hiddenCount = computed(() => Math.max(0, suggestions.value.length - 5))

const expiring = computed(() => {
  const fromApplications = props.applications
    .filter((item) => !item.archived && !['offer', 'rejected', 'closed'].includes(item.stage))
    .map((item) => ({ key: item.id, jobTitle: item.jobTitle, days: daysUntil(item.deadlineAt), applicationId: item.id as string | null }))
  const fromFavorites = favoriteJobs.value
    .filter((job) => !props.applications.some((item) => item.jobId === job.id && !item.archived))
    .map((job) => ({ key: job.id, jobTitle: job.title, days: daysUntil(job.deadlineAt), applicationId: null }))
  return [...fromApplications, ...fromFavorites]
    .filter((entry) => entry.days >= 0 && entry.days <= 7)
    .sort((a, b) => a.days - b.days)
})

const stats = computed(() => buildStats(props.applications))

const dueReminders = computed(() =>
  props.applications
    .filter((item) => !item.archived)
    .flatMap((item) => item.reminders.map((reminder) => ({ reminder, item })))
    .filter(({ reminder }) => reminder.status !== 'cancelled' && daysUntil(reminder.remindAt) <= 0)
    .sort((a, b) => a.reminder.remindAt.localeCompare(b.reminder.remindAt)),
)

const maxFunnel = computed(() => Math.max(1, ...stats.value.funnel.map((entry) => entry.count)))
const maxWeekly = computed(() => Math.max(1, ...stats.value.weekly.map((entry) => entry.count)))

function dismiss(id: string) {
  dismissed.value = new Set(dismissed.value).add(id)
}

function dropApplicationId(suggestion: Suggestion): string | null {
  const action = suggestion.actions.find((entry): entry is Extract<SuggestionAction, { kind: 'drop-application' }> => entry.kind === 'drop-application')
  return action?.applicationId ?? null
}

async function runAction(action: SuggestionAction) {
  if (action.kind === 'route') {
    await router.push(action.to)
    return
  }
  if (action.kind === 'confirm-application') {
    await repository.applications.updateStage(action.applicationId, 'applied', '确认投递（来自工作台建议）')
    await reload()
    return
  }
  if (action.kind === 'drop-application') {
    pendingDropId.value = action.applicationId
    return
  }
  if (action.kind === 'focus-note') {
    emit('open-application', { id: action.applicationId, focusNote: true })
    return
  }
  emit('open-application', { id: action.applicationId })
}

async function confirmDrop(applicationId: string) {
  await repository.applications.archive(applicationId, true)
  pendingDropId.value = null
  await reload()
}
</script>
<template>
  <EmptyState
    v-if="!applications.length"
    title="还没有投递记录"
    description="从浏览在招职位开始，看到心动的机会就点“我要投递”，这里会帮你盯着每一步。"
    action-label="去逛职位库"
    @action="router.push('/jobs')"
  />

  <template v-else>
    <section v-if="expiring.length" class="expiring-banner" aria-label="临期预警">
      <h2>⏰ 临近截止</h2>
      <ul>
        <li v-for="entry in expiring" :key="entry.key" :class="{ urgent: entry.days <= 3 }">
          <button type="button" @click="entry.applicationId ? emit('open-application', { id: entry.applicationId }) : router.push(`/jobs/${entry.key}`)">
            {{ entry.jobTitle }} · {{ entry.days === 0 ? '今天' : `${entry.days} 天后` }}截止
          </button>
        </li>
      </ul>
    </section>

    <section aria-label="今日建议">
      <h2>今天可以做的</h2>
      <ul v-if="visibleSuggestions.length" class="suggestions">
        <li v-for="suggestion in visibleSuggestions" :key="suggestion.id" class="suggestion-card">
          <p>{{ suggestion.message }}</p>
          <div v-if="pendingDropId && pendingDropId === dropApplicationId(suggestion)" class="actions">
            <span class="drop-warning">归档后记录会移出看板，确定放弃吗？</span>
            <button class="quiet" type="button" @click="pendingDropId = null">再想想</button>
            <button class="primary" type="button" @click="confirmDrop(pendingDropId)">确定放弃</button>
          </div>
          <div v-else class="actions">
            <button
              v-for="action in suggestion.actions"
              :key="action.kind + (action.kind === 'route' ? action.to : action.applicationId)"
              class="quiet"
              type="button"
              @click="runAction(action)"
            >{{ action.label }}</button>
          </div>
          <button class="dismiss" type="button" :aria-label="`不再提醒：${suggestion.message}`" @click="dismiss(suggestion.id)">不再提醒</button>
        </li>
      </ul>
      <p v-else class="all-clear">没有待办建议——要么全在正轨上，要么该去投几份新的了 👀</p>
      <p v-if="hiddenCount" class="more-suggestions">还有 {{ hiddenCount }} 条建议，处理完上面的再看</p>
    </section>

    <section aria-label="求职统计">
      <h2>你的投递节奏</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <strong>{{ stats.keyNumbers.interviewing }}</strong><span>面试中</span>
        </div>
        <div class="stat-card">
          <strong>{{ stats.keyNumbers.offers }}</strong><span>Offer</span>
        </div>
        <div class="stat-card">
          <strong>{{ stats.keyNumbers.needsFollowUp }}</strong><span>待跟进</span>
        </div>
      </div>
      <div class="charts">
        <div class="chart">
          <h3>投递漏斗</h3>
          <div v-for="entry in stats.funnel" :key="entry.stage" class="funnel-row">
            <span class="funnel-label">{{ entry.label }}</span>
            <span class="funnel-bar" :style="{ width: `${(entry.count / maxFunnel) * 100}%` }" />
            <span class="funnel-count">{{ entry.count }}</span>
          </div>
        </div>
        <div class="chart">
          <h3>近 7 天投递</h3>
          <div class="weekly-bars" role="img" :aria-label="`近七天投递：${stats.weekly.map((entry) => `${entry.weekday} ${entry.count} 份`).join('，')}`">
            <div v-for="entry in stats.weekly" :key="entry.dateKey" class="weekly-col">
              <span class="weekly-bar" :style="{ height: `${(entry.count / maxWeekly) * 100}%` }" />
              <small>{{ entry.weekday }}</small>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="dueReminders.length" aria-label="到期提醒">
      <h2>到期的提醒</h2>
      <ul class="due-list">
        <li v-for="{ reminder, item } in dueReminders" :key="reminder.id">
          <button type="button" @click="emit('open-application', { id: item.id })">
            {{ reminder.title }} · {{ item.companyName }}
          </button>
        </li>
      </ul>
    </section>
  </template>
</template>
<style scoped>
h2{margin:26px 0 12px;font-size:17px}
.expiring-banner{padding:14px 18px;border-radius:12px;background:color-mix(in srgb,#f79009 12%,transparent)}
.expiring-banner h2{margin:0 0 8px;font-size:15px}
.expiring-banner ul{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.expiring-banner button{padding:5px 12px;border:0;border-radius:8px;font-weight:600;background:var(--cl-surface)}
.expiring-banner .urgent button{color:#b42318;background:color-mix(in srgb,#f04438 14%,var(--cl-surface))}
.suggestions{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.suggestion-card{position:relative;padding:14px 18px;border:1px solid var(--cl-border);border-radius:11px;background:var(--cl-surface)}
.suggestion-card p{margin:0 0 10px}
.actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.actions .quiet{min-height:32px;padding:0 12px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:transparent}
.actions .primary{min-height:32px;padding:0 12px;border:0;border-radius:7px;color:#fff;background:var(--cl-primary)}
.drop-warning{color:var(--cl-muted);font-size:12px}
.dismiss{margin-top:8px;border:0;color:var(--cl-muted);background:transparent;font-size:12px;text-decoration:underline}
.all-clear,.more-suggestions{color:var(--cl-muted);font-size:13px}
.stats-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.stat-card{display:grid;gap:2px;padding:16px;border-radius:11px;background:var(--cl-surface);text-align:center}
.stat-card strong{font-size:26px;color:var(--cl-text-strong)}
.stat-card span{color:var(--cl-muted);font-size:12px}
.charts{display:grid;grid-template-columns:1.4fr 1fr;gap:12px;margin-top:12px}
.chart{padding:16px;border-radius:11px;background:var(--cl-surface)}
.chart h3{margin:0 0 12px;font-size:14px}
.funnel-row{display:grid;grid-template-columns:64px 1fr 26px;gap:8px;align-items:center;margin-bottom:6px}
.funnel-label{color:var(--cl-muted);font-size:12px}
.funnel-bar{height:10px;border-radius:5px;background:var(--cl-primary)}
.funnel-count{color:var(--cl-muted);font-size:12px;text-align:right}
.weekly-bars{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;height:120px}
.weekly-col{display:grid;grid-template-rows:1fr auto;gap:6px;align-items:end;text-align:center}
.weekly-bar{width:100%;min-height:4px;border-radius:4px 4px 0 0;background:var(--cl-primary)}
.weekly-col small{color:var(--cl-muted);font-size:11px}
.due-list{margin:0;padding:0;list-style:none}
.due-list button{padding:8px 14px;border:1px solid var(--cl-border);border-radius:9px;background:var(--cl-surface)}
@media(max-width:760px){.charts{grid-template-columns:1fr}}
</style>
