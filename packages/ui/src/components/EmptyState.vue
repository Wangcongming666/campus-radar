<script setup lang="ts">
defineProps<{ title: string; description?: string; actionLabel?: string }>()
defineEmits<{ action: [] }>()
</script>
<template><section class="empty-state" role="status"><span aria-hidden="true">⌁</span><h2>{{ title }}</h2><p v-if="description">{{ description }}</p><button v-if="actionLabel" class="cl-primary-button" type="button" @click="$emit('action')">{{ actionLabel }}</button></section></template>
<style scoped>
.empty-state{display:grid;justify-items:center;gap:8px;padding:52px 24px;text-align:center;color:var(--cl-muted)}.empty-state>span{width:44px;height:44px;display:grid;place-items:center;margin-bottom:4px;border-radius:50%;color:var(--cl-primary);background:var(--cl-primary-soft);font-size:28px}.empty-state h2{margin:0;color:var(--cl-text-strong);font-size:18px}.empty-state p{max-width:38ch;margin:0 0 10px}
</style>
