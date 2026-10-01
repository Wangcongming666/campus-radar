<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; label?: string }>(), { lines: 3, label: '正在加载' })
</script>
<template>
  <div class="skeleton-card" role="status" :aria-label="label">
    <span class="bar bar-title" />
    <span v-for="line in lines" :key="line" class="bar" :style="{ width: `${58 + ((line * 23) % 36)}%` }" />
  </div>
</template>
<style scoped>
.skeleton-card{display:grid;gap:10px;padding:18px;border-radius:10px;background:var(--cl-surface)}
.bar{display:block;height:12px;border-radius:6px;background:color-mix(in srgb,var(--cl-border) 70%,transparent);animation:skeleton-pulse 1.2s ease-in-out infinite}
.bar-title{width:38%;height:16px}
@keyframes skeleton-pulse{0%,100%{opacity:.45}50%{opacity:1}}
@media(prefers-reduced-motion:reduce){.bar{animation:none}}
</style>
