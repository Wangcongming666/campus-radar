<script setup lang="ts">
import type { Job } from '@career-launch/shared'
import { computed, ref } from 'vue'
import { buildCompareRows } from './compare'

const props = defineProps<{ jobs: Job[] }>()
const emit = defineEmits<{ remove: [id: string]; clear: [] }>()
const open = ref(false)

const rows = computed(() => buildCompareRows(props.jobs))
</script>
<template>
  <div class="compare-tray" role="region" aria-label="职位对比">
    <span>已选 {{ jobs.length }}/3 个职位</span>
    <ul>
      <li v-for="job in jobs" :key="job.id">
        {{ job.title }}
        <button type="button" :aria-label="`移出对比：${job.title}`" @click="emit('remove', job.id)">×</button>
      </li>
    </ul>
    <button class="quiet" type="button" @click="emit('clear')">清空</button>
    <button class="primary" type="button" :disabled="jobs.length < 2" @click="open = true">
      {{ jobs.length < 2 ? '再选一个就能对比' : '开始对比' }}
    </button>
  </div>

  <div v-if="open" class="compare-layer" @mousedown.self="open = false">
    <aside class="compare-drawer" role="dialog" aria-modal="true" aria-label="职位对比">
      <button class="close" type="button" aria-label="关闭对比" @click="open = false">×</button>
      <h2>职位对比</h2>
      <p class="hint">差异字段已高亮，相同字段说明这几份工作在这点上打平。</p>
      <div class="compare-table-wrap">
        <table class="compare-table">
          <thead>
            <tr>
              <th scope="col">维度</th>
              <th v-for="job in jobs" :key="job.id" scope="col">
                <RouterLink :to="`/jobs/${job.id}`">{{ job.title }}</RouterLink>
                <small>{{ job.companyName }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.label" :class="{ differs: row.differs }">
              <th scope="row">{{ row.label }}</th>
              <td v-for="(value, index) in row.values" :key="index">{{ value }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </aside>
  </div>
</template>
<style scoped>
.compare-tray{position:fixed;z-index:70;bottom:0;left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;align-items:center;gap:12px;max-width:min(92vw,760px);padding:12px 18px;border:1px solid var(--cl-border);border-bottom:0;border-radius:12px 12px 0 0;background:var(--cl-surface);box-shadow:var(--cl-shadow-float)}
.compare-tray>span{color:var(--cl-muted);font-size:12px;white-space:nowrap}
.compare-tray ul{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.compare-tray li{display:flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;background:var(--cl-primary-soft);font-size:12px}
.compare-tray li button{border:0;background:transparent;color:var(--cl-muted)}
.compare-tray .quiet{min-height:34px;padding:0 12px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:transparent}
.compare-tray .primary{min-height:34px;padding:0 14px;border:0;border-radius:7px;color:#fff;background:var(--cl-primary)}
.compare-tray .primary:disabled{opacity:.6}
.compare-layer{position:fixed;z-index:80;inset:0;background:rgba(8,15,29,.45)}
.compare-drawer{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(96vw,860px);max-height:86vh;overflow:auto;padding:26px;background:var(--cl-surface);border-radius:14px}
.close{position:absolute;top:14px;right:14px;width:36px;height:36px;border:0;border-radius:50%;background:var(--cl-canvas);font-size:22px}
h2{margin:0 0 4px}
.hint{margin:0 0 16px;color:var(--cl-muted);font-size:13px}
.compare-table-wrap{overflow-x:auto}
.compare-table{width:100%;border-collapse:collapse}
.compare-table th,.compare-table td{padding:10px 12px;border:1px solid var(--cl-border);text-align:left;vertical-align:top;font-size:13px}
.compare-table thead a{color:var(--cl-text-strong);font-weight:700}
.compare-table thead small{display:block;color:var(--cl-muted)}
.compare-table tbody th{color:var(--cl-muted);font-weight:600;white-space:nowrap}
.compare-table tr.differs td{background:var(--cl-primary-soft);font-weight:600}
</style>
