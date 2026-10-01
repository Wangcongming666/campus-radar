<script setup lang="ts">
import type { Application, ApplicationStage } from '@career-launch/shared'
import { daysUntil, formatDeadlineStatus } from '@career-launch/shared'
import { computed, inject, ref } from 'vue'
import { StatusBadge } from '@career-launch/ui'
import { repository } from '../../services/repository'
import { stageMeta } from './stages'

const props = defineProps<{ applications: Application[] }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()
const reload = inject<() => void>('reloadApplications', () => {})

const stages = Object.keys(stageMeta) as ApplicationStage[]
const confirmArchiveId = ref<string | null>(null)

const active = computed(() => props.applications.filter((item) => !item.archived))
const grouped = computed(() =>
  Object.fromEntries(stages.map((stage) => [stage, active.value.filter((item) => item.stage === stage)])) as Record<ApplicationStage, Application[]>,
)

function idleDays(application: Application): number {
  const last = application.events[application.events.length - 1]
  return last ? -daysUntil(last.occurredAt) : 0
}

function deadline(application: Application) {
  return formatDeadlineStatus(application.deadlineAt)
}

async function archive(id: string) {
  await repository.applications.archive(id, true)
  confirmArchiveId.value = null
  await reload()
}
</script>
<template>
  <div class="board">
    <section v-for="stage in stages" :key="stage">
      <header>
        <StatusBadge :tone="stageMeta[stage]?.tone ?? 'neutral'">{{ stageMeta[stage]?.label }}</StatusBadge>
        <span>{{ grouped[stage]?.length ?? 0 }}</span>
      </header>
      <article v-for="item in grouped[stage]" :key="item.id" class="application-card">
        <button class="card-main" type="button" @click="emit('open-application', { id: item.id })">
          <span class="logo" aria-hidden="true">{{ item.companyLogoText }}</span>
          <strong>{{ item.jobTitle }}</strong>
          <small>{{ item.companyName }} · {{ item.city.join(' / ') }}</small>
          <time :title="new Date(item.updatedAt).toLocaleString('zh-CN')">停留 {{ idleDays(item) }} 天</time>
          <span v-if="deadline(item).days <= 7 && deadline(item).days >= 0" class="deadline-chip" :class="deadline(item).tone">
            {{ deadline(item).label }}
          </span>
        </button>
        <span
          v-if="idleDays(item) > 7"
          class="stale-chip"
          role="img"
          :aria-label="`已 ${idleDays(item)} 天无进展，建议跟进`"
          :title="`已 ${idleDays(item)} 天无进展，建议跟进`"
        >…</span>
        <span
          v-if="confirmArchiveId === item.id"
          class="archive-confirm"
          role="group"
          :aria-label="`确认归档 ${item.jobTitle}`"
        >
          <button type="button" @click="confirmArchiveId = null">取消</button>
          <button type="button" @click="archive(item.id)">确认归档</button>
        </span>
        <button
          v-else
          class="archive-link"
          type="button"
          :aria-label="`归档 ${item.jobTitle}`"
          @click="confirmArchiveId = item.id"
        >归档</button>
      </article>
    </section>
  </div>
</template>
<style scoped>
.board{display:grid;grid-template-columns:repeat(7,minmax(210px,1fr));gap:10px;overflow-x:auto;padding-bottom:12px}
.board>section{min-height:390px;padding:11px;border-radius:10px;background:var(--cl-border)}
.board>section>header{display:flex;justify-content:space-between;margin-bottom:10px}
.board>section>header>span{color:var(--cl-muted)}
.application-card{position:relative;width:100%;margin-bottom:8px;border-radius:9px;background:var(--cl-surface)}
.card-main{width:100%;display:grid;grid-template-columns:34px 1fr auto;gap:3px 9px;padding:12px;border:0;border-radius:9px;color:var(--cl-text);background:transparent;text-align:left}
.logo{width:34px;height:34px;display:grid;grid-row:span 2;place-items:center;border-radius:8px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}
.card-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.card-main small{grid-column:2;color:var(--cl-muted);font-size:11px}
.card-main time{grid-column:1/-1;margin-top:4px;color:var(--cl-muted);font-size:11px}
.deadline-chip{grid-column:1/-1;justify-self:start;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600}
.deadline-chip.danger{color:#b42318;background:color-mix(in srgb,#f04438 14%,transparent)}
.deadline-chip.warning{color:#b54708;background:color-mix(in srgb,#f79009 16%,transparent)}
.deadline-chip.primary{color:var(--cl-primary);background:var(--cl-primary-soft)}
.stale-chip{position:absolute;top:10px;right:10px;color:var(--cl-muted);font-weight:700}
.archive-link{position:absolute;bottom:8px;right:8px;border:0;color:var(--cl-muted);background:transparent;font-size:11px;text-decoration:underline}
.archive-link:hover{color:var(--cl-text)}
.archive-confirm{position:absolute;bottom:6px;right:8px;display:flex;gap:4px}
.archive-confirm button{border:0;color:var(--cl-primary);background:transparent;font-size:11px;text-decoration:underline}
@media(max-width:650px){.application-card{grid-template-columns:34px 1fr}}
</style>
