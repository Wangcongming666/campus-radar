<script setup lang="ts">withDefaults(defineProps<{tone?:'neutral'|'primary'|'success'|'warning'|'danger'}>(),{tone:'neutral'})</script>
<template><span class="status-badge" :data-tone="tone"><slot /></span></template>
<style scoped>
.status-badge{display:inline-flex;align-items:center;min-height:24px;padding:2px 9px;border-radius:999px;color:var(--cl-muted);background:var(--cl-canvas);font-size:12px;font-weight:600;white-space:nowrap}.status-badge[data-tone=primary]{color:var(--cl-primary);background:var(--cl-primary-soft)}.status-badge[data-tone=success]{color:var(--cl-success);background:var(--cl-success-soft)}.status-badge[data-tone=warning]{color:var(--cl-warning);background:var(--cl-warning-soft)}.status-badge[data-tone=danger]{color:var(--cl-danger);background:var(--cl-danger-soft)}
</style>
