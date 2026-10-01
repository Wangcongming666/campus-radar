<script setup lang="ts">
import type { Application, ApplicationStage } from '@career-launch/shared'
import { formatDeadlineStatus } from '@career-launch/shared'
import { computed, inject, ref } from 'vue'
import { StatusBadge } from '@career-launch/ui'
import { repository } from '../../services/repository'
import { stageMeta } from './stages'

const props = defineProps<{ applications: Application[] }>()
const emit = defineEmits<{ 'open-application': [payload: { id: string; focusNote?: boolean }] }>()
const reload = inject<() => void>('reloadApplications', () => {})

const stages = Object.keys(stageMeta) as ApplicationStage[]
const stageFilter = ref<'all' | ApplicationStage>('all')
const archiveFilter = ref<'active' | 'archived' | 'all'>('active')
const sortKey = ref<'updated' | 'deadline'>('updated')
const selected = ref(new Set<string>())
const batchConfirm = ref(false)

const rows = computed(() => {
  let items = props.applications.slice()
  if (archiveFilter.value === 'active') items = items.filter((item) => !item.archived)
  if (archiveFilter.value === 'archived') items = items.filter((item) => item.archived)
  if (stageFilter.value !== 'all') items = items.filter((item) => item.stage === stageFilter.value)
  items.sort((a, b) =>
    sortKey.value === 'deadline' ? a.deadlineAt.localeCompare(b.deadlineAt) : b.updatedAt.localeCompare(a.updatedAt),
  )
  return items
})

const allSelected = computed(() => rows.value.length > 0 && rows.value.every((item) => selected.value.has(item.id)))

function toggleRow(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
}

function toggleAll() {
  if (allSelected.value) selected.value.clear()
  else rows.value.forEach((item) => selected.value.add(item.id))
}

async function batchArchive(value: boolean) {
  for (const id of selected.value) await repository.applications.archive(id, value)
  selected.value.clear()
  batchConfirm.value = false
  await reload()
}
</script>
<template>
  <div class="list-tools">
    <label>
      阶段
      <select v-model="stageFilter" aria-label="按阶段筛选">
        <option value="all">全部阶段</option>
        <option v-for="stage in stages" :key="stage" :value="stage">{{ stageMeta[stage]?.label }}</option>
      </select>
    </label>
    <label>
      状态
      <select v-model="archiveFilter" aria-label="按归档状态筛选">
        <option value="active">进行中</option>
        <option value="archived">已归档</option>
        <option value="all">全部</option>
      </select>
    </label>
    <label>
      排序
      <select v-model="sortKey" aria-label="排序方式">
        <option value="updated">最近更新</option>
        <option value="deadline">截止优先</option>
      </select>
    </label>
  </div>

  <div v-if="selected.size" class="batch-bar" role="region" aria-label="批量操作">
    <span>已选 {{ selected.size }} 条投递</span>
    <template v-if="batchConfirm">
      <span class="batch-warning">归档后记录会移出看板，可随时在“已归档”筛选里恢复。</span>
      <button class="quiet" type="button" @click="batchConfirm = false">取消</button>
      <button class="primary" type="button" @click="batchArchive(true)">确认归档</button>
    </template>
    <template v-else>
      <button class="quiet" type="button" @click="batchConfirm = true">批量归档</button>
      <button class="quiet" type="button" :disabled="archiveFilter !== 'archived'" @click="batchArchive(false)">批量恢复</button>
    </template>
  </div>

  <div class="application-list cl-card">
    <article v-for="item in rows" :key="item.id" :class="{ archived: item.archived }">
      <input
        type="checkbox"
        :checked="selected.has(item.id)"
        :aria-label="`选择 ${item.jobTitle}`"
        @change="toggleRow(item.id)"
      />
      <span class="logo" aria-hidden="true">{{ item.companyLogoText }}</span>
      <div>
        <strong>{{ item.jobTitle }}</strong>
        <small>{{ item.companyName }} · {{ item.city.join(' / ') }}</small>
        <small :title="new Date(item.deadlineAt).toLocaleDateString('zh-CN')">{{ formatDeadlineStatus(item.deadlineAt).label }}</small>
      </div>
      <StatusBadge :tone="stageMeta[item.stage]?.tone ?? 'neutral'">{{ stageMeta[item.stage]?.label }}</StatusBadge>
      <button class="quiet" type="button" @click="emit('open-application', { id: item.id })">详情</button>
    </article>
    <div v-if="!rows.length" class="list-empty">这个筛选下没有投递记录。换个条件，或去职位列表看看新机会。</div>
  </div>
</template>
<style scoped>
.list-tools{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px}
.list-tools label{display:grid;gap:4px;color:var(--cl-muted);font-size:12px}
.list-tools select{height:36px;padding:0 9px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:var(--cl-surface)}
.batch-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border-radius:9px;background:var(--cl-primary-soft)}
.batch-bar button{min-height:32px;padding:0 12px;border-radius:7px}
.batch-bar .quiet{border:1px solid var(--cl-border);color:var(--cl-text);background:transparent}
.batch-bar .primary{border:0;color:#fff;background:var(--cl-primary)}
.batch-warning{color:var(--cl-muted);font-size:12px}
.application-list article{display:grid;grid-template-columns:auto 40px 1fr 90px auto;gap:12px;align-items:center;padding:14px 18px}
.application-list article+article{border-top:1px solid var(--cl-border)}
.application-list article.archived{opacity:.55}
.application-list strong,.application-list small{display:block}
.application-list small{color:var(--cl-muted);font-size:11px}
.logo{width:40px;height:40px;display:grid;place-items:center;border-radius:8px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}
.application-list .quiet{border:1px solid var(--cl-border);border-radius:7px;min-height:32px;color:var(--cl-text);background:transparent}
.list-empty{padding:36px;text-align:center;color:var(--cl-muted)}
@media(max-width:650px){.application-list article{grid-template-columns:auto 36px 1fr}.application-list article>*:nth-child(n+4){grid-column:2}}
</style>
