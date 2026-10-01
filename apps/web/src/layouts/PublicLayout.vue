<script setup lang="ts">
import { AppLogo } from '@career-launch/ui'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import LoginDialog from '../features/auth/LoginDialog.vue'
import { useSessionStore } from '../stores/session'
const menuOpen=ref(false)
const confirmLogout=ref(false)
const session=useSessionStore()
const router=useRouter()
onMounted(session.hydrate)
async function signOut(){
  if(!confirmLogout.value){confirmLogout.value=true;return}
  confirmLogout.value=false
  await session.logout()
  await router.push('/')
}
</script>
<template><a class="cl-skip-link" href="#main-content">跳到主要内容</a><header class="site-header"><div class="cl-container header-inner"><RouterLink to="/" @click="menuOpen=false"><AppLogo/></RouterLink><button class="menu-toggle" type="button" :aria-expanded="menuOpen" aria-controls="site-nav" @click="menuOpen=!menuOpen">菜单</button><template v-if="session.user"><nav id="site-nav" :class="{open:menuOpen}" aria-label="主导航"><RouterLink to="/jobs">找职位</RouterLink><RouterLink to="/companies">公司库</RouterLink><RouterLink to="/knowledge">面试宝典</RouterLink><RouterLink to="/me/resumes">简历中心</RouterLink><RouterLink to="/me/workspace">求职工作台</RouterLink></nav><RouterLink class="account-link" to="/me/profile">{{session.user.nickname}}</RouterLink><span v-if="confirmLogout" class="logout-confirm"><button type="button" @click="confirmLogout=false">取消</button><button class="logout-final" type="button" @click="signOut">确认退出（回到官网首页，数据保留）</button></span><button v-else class="logout-button" type="button" @click="signOut">退出</button></template><button v-else class="cl-primary-button account-button" type="button" @click="menuOpen=false;session.requestLogin()">登录 / 注册</button></div></header><main id="main-content"><RouterView/></main><LoginDialog/></template>
<style scoped>
.site-header{position:sticky;z-index:30;top:0;height:68px;border-bottom:1px solid color-mix(in srgb,var(--cl-border) 82%,transparent);background:color-mix(in srgb,var(--cl-surface) 92%,transparent);backdrop-filter:blur(14px)}.header-inner{height:100%;display:flex;align-items:center;gap:28px}nav{display:flex;align-items:center;gap:25px;margin-right:auto;color:var(--cl-muted);font-size:14px;font-weight:600}nav a:hover,nav a.router-link-active{color:var(--cl-primary)}.menu-toggle{display:none}.account-button{min-height:38px}.account-link{color:var(--cl-primary);font-weight:700}@media(max-width:850px){.header-inner{justify-content:space-between}.menu-toggle{display:inline-flex;min-height:40px;align-items:center;border:0;color:var(--cl-text);background:transparent}nav{position:absolute;top:67px;right:14px;left:14px;display:none;flex-direction:column;align-items:stretch;gap:0;padding:10px;border:1px solid var(--cl-border);border-radius:var(--cl-radius-md);background:var(--cl-surface);box-shadow:var(--cl-shadow-float)}nav.open{display:flex}nav a{padding:12px}.account-button{display:none}.logout-button{border:0;color:var(--cl-muted);background:transparent;font-size:14px;font-weight:600}.logout-button:hover{color:var(--cl-text)}.logout-confirm{display:flex;gap:8px;align-items:center;font-size:12px}.logout-confirm button{border:0;color:var(--cl-muted);background:transparent;text-decoration:underline}.logout-confirm .logout-final{color:#c2410c}@media(max-width:850px){.logout-button,.logout-confirm{display:none}}}
</style>
