<script setup lang="ts">
import type {Job,JobQuery} from '@career-launch/shared'
import {parseJobQuery,serializeJobQuery} from '@career-launch/shared'
import {EmptyState} from '@career-launch/ui'
import {computed,onMounted,ref,watch} from 'vue'
import {useRoute,useRouter} from 'vue-router'
import {repository} from '../../services/repository'
import JobCard from './JobCard.vue';import JobFilters from './JobFilters.vue'
const route=useRoute();const router=useRouter();const query=ref<JobQuery>(parseJobQuery(new URLSearchParams(route.query as Record<string,string>)));const jobs=ref<Job[]>([]);const total=ref(0);const loading=ref(false);const keyword=ref(query.value.keyword??'')
const summary=computed(()=>query.value.keyword?`“${query.value.keyword}”相关职位`:'全部校招职位')
async function load(){loading.value=true;const page=await repository.jobs.list(query.value);jobs.value=page.items;total.value=page.total;loading.value=false}
function update(value:JobQuery){query.value=value;router.replace({query:Object.fromEntries(serializeJobQuery(value).entries())})}
function search(){update({...query.value,...(keyword.value.trim()?{keyword:keyword.value.trim()}:{keyword:undefined}),page:1} as JobQuery)}
watch(query,load,{deep:true});onMounted(load)
</script>
<template><section class="cl-page cl-container"><div class="jobs-hero"><div><p>2027 届秋招职位库</p><h1>找到与你匹配的机会</h1></div><form role="search" @submit.prevent="search"><input v-model="keyword" aria-label="搜索职位" placeholder="搜索职位、公司或城市"/><button class="cl-primary-button">搜索</button></form></div><div class="jobs-layout"><JobFilters :model-value="query" @update:model-value="update"/><main><header class="result-head"><div><strong>{{summary}}</strong><span>共 {{total}} 个机会</span></div><select :value="query.sort" aria-label="排序方式" @change="update({...query,sort:($event.target as HTMLSelectElement).value as JobQuery['sort'],page:1})"><option value="latest">最新发布</option><option value="deadline">截止优先</option></select></header><div v-if="loading" class="result-loading">正在筛选合适机会…</div><EmptyState v-else-if="!jobs.length" title="没有找到匹配职位" description="减少筛选条件，或换一个关键词再试。" action-label="清空筛选" @action="update({city:[],category:[],education:[],sort:'latest',page:1,pageSize:12})"/><div v-else class="job-list"><JobCard v-for="job in jobs" :key="job.id" :job="job"/></div></main></div></section></template>
<style scoped>
.jobs-hero{display:flex;align-items:end;justify-content:space-between;gap:30px;margin-bottom:28px}.jobs-hero p{margin-bottom:5px;color:var(--cl-primary);font-weight:700}.jobs-hero h1{margin:0;color:var(--cl-text-strong);font-size:38px;letter-spacing:-.04em}.jobs-hero form{display:grid;grid-template-columns:minmax(220px,360px) auto;gap:8px}.jobs-hero input{height:43px;padding:0 14px;border:1px solid var(--cl-border-strong);border-radius:8px;color:var(--cl-text);background:var(--cl-surface)}.jobs-layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:20px}.result-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.result-head strong,.result-head span{display:block}.result-head span{color:var(--cl-muted);font-size:13px}.result-head select{height:38px;padding:0 10px;border:1px solid var(--cl-border);border-radius:7px;color:var(--cl-text);background:var(--cl-surface)}.job-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.result-loading{padding:60px;text-align:center;color:var(--cl-muted)}@media(max-width:840px){.jobs-hero{align-items:start;flex-direction:column}.jobs-hero form{width:100%}.jobs-layout{grid-template-columns:1fr}}@media(max-width:590px){.jobs-hero h1{font-size:31px}.jobs-hero form{grid-template-columns:1fr}.job-list{grid-template-columns:1fr}}
</style>
