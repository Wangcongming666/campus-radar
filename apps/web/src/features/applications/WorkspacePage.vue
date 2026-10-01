<script setup lang="ts">
import type { Application } from '@career-launch/shared'
import { SkeletonCard } from '@career-launch/ui'
import { computed, onMounted, provide, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { repository } from '../../services/repository'
import ApplicationDrawer from './ApplicationDrawer.vue'
import ApplicationsBoard from './ApplicationsBoard.vue'
import ApplicationsList from './ApplicationsList.vue'
import CalendarView from './CalendarView.vue'
import TodayFocus from './TodayFocus.vue'

const TABS = [
  { key: 'today', label: '今日聚焦' },
  { key: 'board', label: '看板' },
  { key: 'list', label: '列表' },
  { key: 'calendar', label: '日历' },
] as const
type TabKey = (typeof TABS)[number]['key']

const route = useRoute()
const router = useRouter()
const applications = ref<Application[]>([])
const loading = ref(false)
const drawerId = ref<string | null>(null)
const drawerFocusNote = ref(false)

const tab = computed<TabKey>(() => {
  const value = route.query.view
  return TABS.some((entry) => entry.key === value) ? (value as TabKey) : 'today'
})

const drawerApplication = computed(() => applications.value.find((item) => item.id === drawerId.value) ?? null)

function selectTab(key: TabKey) {
  const query: Record<string, string> = { ...route.query } as Record<string, string>
  if (key === 'today') delete query.view
  else query.view = key
  router.replace({ query })
}

async function load() {
  loading.value = true
  try {
    applications.value = await repository.applications.list()
  } finally {
    loading.value = false
  }
}

function openApplication(payload: { id: string; focusNote?: boolean }) {
  drawerId.value = payload.id
  drawerFocusNote.value = payload.focusNote ?? false
}

provide('reloadApplications', load)
onMounted(load)
</script>
<template>
  <section>
    <header class="page-head">
      <div>
        <h1>求职工作台</h1>
        <p>把每一次申请放在正确阶段，下一步会更清楚。</p>
      </div>
    </header>

    <div class="view-toggle" role="tablist" aria-label="工作台视图">
      <button
        v-for="entry in TABS"
        :key="entry.key"
        type="button"
        role="tab"
        :aria-selected="tab === entry.key"
        :aria-pressed="tab === entry.key"
        @click="selectTab(entry.key)"
      >{{ entry.label }}</button>
    </div>

    <div v-if="tab === 'today'" class="today-wrap">
      <SkeletonCard v-if="loading" :lines="6" label="正在加载工作台" />
      <TodayFocus v-else :applications="applications" @open-application="openApplication" />
    </div>
    <ApplicationsBoard v-else-if="tab === 'board'" :applications="applications" @open-application="openApplication" />
    <ApplicationsList v-else-if="tab === 'list'" :applications="applications" @open-application="openApplication" />
    <CalendarView v-else :applications="applications" @open-application="openApplication" />

    <ApplicationDrawer :application="drawerApplication" :focus-note="drawerFocusNote" @close="drawerId = null" />
  </section>
</template>
<style scoped>
.page-head h1{margin:0;font-size:30px}
.page-head p{color:var(--cl-muted)}
.view-toggle{display:flex;align-self:start;padding:3px;margin:18px 0;border-radius:8px;background:var(--cl-border)}
.view-toggle button{padding:6px 13px;border:0;border-radius:6px;color:var(--cl-muted);background:transparent}
.view-toggle button[aria-pressed=true]{color:var(--cl-text);background:var(--cl-surface)}
</style>
