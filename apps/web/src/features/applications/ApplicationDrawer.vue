<script setup lang="ts">
import type { Application, ApplicationStage, Reminder } from '@career-launch/shared'
import { computed, inject, nextTick, ref, watch } from 'vue'
import { repository } from '../../services/repository'
import { canTransition, stageMeta } from './stages'

const props = defineProps<{ application: Application | null; focusNote?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const reload = inject<() => void>('reloadApplications', () => {})
const stages = Object.keys(stageMeta) as ApplicationStage[]
const noteDraft = ref('')
const reminderTitle = ref('')
const reminderAt = ref('')
const savingNote = ref(false)
const confirmArchive = ref(false)
const noteInput = ref<HTMLTextAreaElement | null>(null)

const reminders = computed(() => props.application?.reminders ?? [])

watch(
  () => props.application,
  async (value) => {
    noteDraft.value = value?.note ?? ''
    reminderTitle.value = ''
    reminderAt.value = ''
    confirmArchive.value = false
    if (value && props.focusNote) {
      await nextTick()
      noteInput.value?.focus()
    }
  },
  { immediate: true },
)

async function changeStage(event: Event) {
  if (!props.application) return
  const next = (event.target as HTMLSelectElement).value as ApplicationStage
  if (!canTransition(props.application.stage, next)) return
  await repository.applications.updateStage(props.application.id, next)
  await reload()
}

async function saveNote() {
  if (!props.application) return
  savingNote.value = true
  await repository.applications.setNote(props.application.id, noteDraft.value)
  savingNote.value = false
  await reload()
}

async function addReminder() {
  if (!props.application || !reminderAt.value || !reminderTitle.value.trim()) return
  await repository.applications.reminders.add(props.application.id, new Date(reminderAt.value).toISOString(), reminderTitle.value.trim())
  await reload()
}

async function removeReminder(reminder: Reminder) {
  await repository.applications.reminders.remove(reminder.id)
  await reload()
}

async function toggleArchive() {
  if (!props.application) return
  if (!confirmArchive.value) {
    confirmArchive.value = true
    return
  }
  await repository.applications.archive(props.application.id, !props.application.archived)
  emit('close')
  await reload()
}
</script>
<template>
  <div v-if="application" class="drawer-layer" @mousedown.self="emit('close')">
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="投递详情">
      <button class="close" type="button" aria-label="关闭详情" @click="emit('close')">×</button>
      <span class="logo large" aria-hidden="true">{{ application.companyLogoText }}</span>
      <h2>{{ application.jobTitle }}</h2>
      <p>{{ application.companyName }} · {{ application.city.join(' / ') }}</p>

      <label>
        当前阶段
        <select :value="application.stage" aria-label="更新投递阶段" @change="changeStage">
          <option v-for="stage in stages" :key="stage" :value="stage" :disabled="!canTransition(application.stage, stage)">
            {{ stageMeta[stage]?.label }}
          </option>
        </select>
      </label>

      <h3>备注</h3>
      <textarea ref="noteInput" v-model="noteDraft" rows="3" aria-label="投递备注" placeholder="记录笔试安排、面试要点或答复计划…" />
      <button class="cl-quiet-button" type="button" :disabled="savingNote" @click="saveNote">
        {{ savingNote ? '保存中…' : '保存备注' }}
      </button>

      <h3>下一步提醒</h3>
      <ul v-if="reminders.length" class="reminder-list">
        <li v-for="reminder in reminders" :key="reminder.id">
          <div>
            <strong>{{ reminder.title }}</strong>
            <small>{{ new Date(reminder.remindAt).toLocaleString('zh-CN') }} · {{ reminder.status === 'sent' ? '已送达' : '已排期' }}</small>
          </div>
          <button class="danger" type="button" :aria-label="`删除提醒：${reminder.title}`" @click="removeReminder(reminder)">删除</button>
        </li>
      </ul>
      <p v-else class="hint">还没有提醒。设置一个，到时间会出现在通知中心。</p>
      <div class="reminder-form">
        <input v-model="reminderTitle" type="text" aria-label="提醒标题" placeholder="做什么，比如“准备笔试”" />
        <input v-model="reminderAt" type="datetime-local" aria-label="提醒时间" />
        <button class="cl-primary-button" type="button" :disabled="!reminderTitle.trim() || !reminderAt" @click="addReminder">设置提醒</button>
      </div>

      <h3>进度时间线</h3>
      <ol class="timeline">
        <li v-for="event in application.events" :key="event.id">
          <span />
          <div>
            <strong>{{ stageMeta[event.toStage]?.label }}</strong>
            <small>{{ new Date(event.occurredAt).toLocaleString('zh-CN') }}</small>
            <p v-if="event.note">{{ event.note }}</p>
          </div>
        </li>
      </ol>

      <button class="archive-button" type="button" @click="toggleArchive">
        {{ application.archived ? '恢复这条投递记录' : confirmArchive ? '再点一次确认归档（归档后可在列表恢复）' : '归档这条投递' }}
      </button>
    </aside>
  </div>
</template>
<style scoped>
.drawer-layer{position:fixed;z-index:80;inset:0;background:rgba(8,15,29,.45)}
.drawer{position:absolute;top:0;right:0;width:min(100%,430px);height:100%;overflow:auto;padding:30px;background:var(--cl-surface);box-shadow:var(--cl-shadow-float)}
.close{position:absolute;top:16px;right:16px;width:36px;height:36px;border:0;border-radius:50%;background:var(--cl-canvas);font-size:22px}
.logo.large{width:52px;height:52px;display:grid;place-items:center;border-radius:10px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}
.drawer h2{margin:14px 0 2px}
.drawer>p{color:var(--cl-muted)}
.drawer label{display:grid;gap:6px;margin:20px 0}
.drawer h3{margin-top:28px;font-size:16px}
.drawer select,.drawer textarea,.reminder-form input{width:100%;padding:8px 9px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:var(--cl-surface)}
.drawer textarea{resize:vertical}
.timeline{padding:0;list-style:none}
.timeline li{display:grid;grid-template-columns:12px 1fr;gap:10px;padding:8px 0}
.timeline li>span{width:9px;height:9px;margin-top:7px;border-radius:50%;background:var(--cl-primary)}
.timeline small{display:block;color:var(--cl-muted)}
.timeline p{margin:4px 0}
.reminder-list{padding:0;margin:0;list-style:none}
.reminder-list li{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--cl-border)}
.reminder-list small{display:block;color:var(--cl-muted)}
.reminder-list .danger{border:0;color:#c2410c;background:transparent;text-decoration:underline}
.hint{color:var(--cl-muted);font-size:13px}
.reminder-form{display:grid;gap:8px;margin-top:8px}
.reminder-form .cl-primary-button{min-height:38px}
.archive-button{width:100%;min-height:40px;margin-top:24px;border:1px solid var(--cl-border);border-radius:8px;color:var(--cl-muted);background:transparent}
@media(max-width:650px){.drawer{padding:22px}}
</style>
