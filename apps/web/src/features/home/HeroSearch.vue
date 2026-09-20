<script setup lang="ts">
import { Search } from '@element-plus/icons-vue'
import { ref } from 'vue'
const keyword=ref('')
const emit=defineEmits<{search:[keyword:string]}>()
function submit(){emit('search',keyword.value.trim())}
</script>
<template><form class="hero-search" role="search" @submit.prevent="submit"><Search aria-hidden="true"/><input v-model="keyword" aria-label="搜索公司、岗位或城市" placeholder="搜索公司、岗位或城市"/><button type="submit">搜职位</button></form></template>
<style scoped>
.hero-search{display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:10px;max-width:680px;padding:7px 7px 7px 17px;border:1px solid var(--cl-border-strong);border-radius:12px;background:var(--cl-surface);box-shadow:0 16px 44px rgba(49,92,245,.12)}.hero-search svg{width:19px;color:var(--cl-muted)}input{min-width:0;height:44px;border:0;outline:0;color:var(--cl-text);background:transparent;font-size:16px}button{height:44px;padding:0 22px;border:0;border-radius:8px;color:#fff;background:var(--cl-primary);font-weight:700}@media(max-width:520px){.hero-search{grid-template-columns:20px 1fr;padding:8px 12px}.hero-search button{grid-column:1/-1;width:100%}}
</style>
