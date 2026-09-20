<script setup lang="ts">
import type { Job } from '@career-launch/shared'
import { formatDeadline } from '@career-launch/shared'
import { StatusBadge } from '@career-launch/ui'
defineProps<{job:Job}>()
</script>
<template><article class="job-card cl-card"><header><span class="company-mark" aria-hidden="true">{{job.companyLogoText}}</span><div><RouterLink class="job-title" :to="`/jobs/${job.id}`">{{job.title}}</RouterLink><p>{{job.companyName}}</p></div><button type="button" :aria-label="job.favorite?'取消收藏':'收藏职位'">{{job.favorite?'★':'☆'}}</button></header><div class="job-meta"><span>{{job.city.join(' / ')}}</span><span>{{job.education.join(' / ')}}</span><span>{{job.salaryLabel}}</span></div><footer><StatusBadge tone="primary">{{job.category}}</StatusBadge><StatusBadge :tone="formatDeadline(job.deadlineAt)==='已截止'?'neutral':'warning'">{{formatDeadline(job.deadlineAt)}}</StatusBadge></footer></article></template>
<style scoped>
.job-card{display:grid;gap:17px;padding:20px;transition:border-color .16s ease,transform .16s ease}.job-card:hover{border-color:var(--cl-border-strong);transform:translateY(-2px)}header{display:grid;grid-template-columns:42px 1fr auto;gap:12px;align-items:center}.company-mark{width:42px;height:42px;display:grid;place-items:center;border-radius:10px;color:var(--cl-primary);background:var(--cl-primary-soft);font-weight:800}.job-title{display:block;color:var(--cl-text-strong);font-size:17px;font-weight:700}.job-title:hover{color:var(--cl-primary)}p{margin:2px 0 0;color:var(--cl-muted);font-size:13px}header button{border:0;color:var(--cl-primary);background:transparent;font-size:22px}.job-meta{display:flex;flex-wrap:wrap;gap:7px 16px;color:var(--cl-muted);font-size:13px}.job-meta span+span{position:relative}.job-meta span+span::before{content:"";position:absolute;top:50%;left:-9px;width:2px;height:2px;border-radius:50%;background:var(--cl-subtle)}footer{display:flex;justify-content:space-between;gap:8px}
</style>
