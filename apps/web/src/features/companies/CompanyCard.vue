<script setup lang="ts">import type {Company} from '@career-launch/shared';defineProps<{company:Company}>()</script>
<template><RouterLink class="company-card cl-card" :to="`/companies/${company.id}`"><span class="company-logo">{{company.logoText}}</span><div><h3>{{company.name}}</h3><p>{{company.industry}} · {{company.scale}}</p><small>{{company.summary}}</small></div></RouterLink></template>
<style scoped>
.company-card{display:flex;gap:14px;padding:18px;color:var(--cl-text);transition:border-color .16s ease}.company-card:hover{border-color:var(--cl-primary)}.company-logo{flex:0 0 auto;width:46px;height:46px;display:grid;place-items:center;border-radius:12px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}h3{margin:0;color:var(--cl-text-strong);font-size:16px}p{margin:2px 0 8px;color:var(--cl-muted);font-size:13px}small{display:-webkit-box;overflow:hidden;color:var(--cl-muted);line-height:1.5;-webkit-line-clamp:2;-webkit-box-orient:vertical}
</style>
