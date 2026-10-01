<script setup lang="ts">
import { AppLogo } from '@career-launch/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoginDialog from '../features/auth/LoginDialog.vue'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const headerRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const accountOpen = ref(false)
const confirmLogout = ref(false)

const isMarketing = computed(() => route.path === '/')
const initial = computed(() => session.user?.nickname.slice(0, 1) ?? '')

function toggleAccount() {
  accountOpen.value = !accountOpen.value
  confirmLogout.value = false
}

function closeAccount() {
  accountOpen.value = false
  confirmLogout.value = false
}

function onDocumentClick(event: MouseEvent) {
  if (accountOpen.value && headerRef.value && !headerRef.value.contains(event.target as Node)) closeAccount()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAccount()
}

onMounted(() => {
  document.addEventListener('mousedown', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

async function signOut() {
  closeAccount()
  await session.logout()
  await router.push('/')
}
</script>
<template>
  <a class="cl-skip-link" href="#main-content">跳到主要内容</a>
  <header ref="headerRef" class="site-header">
    <div class="cl-container header-inner">
      <RouterLink to="/" @click="menuOpen = false"><AppLogo /></RouterLink>
      <button
        v-if="session.user && !isMarketing"
        class="menu-toggle"
        type="button"
        :aria-expanded="menuOpen"
        aria-controls="site-nav"
        @click="menuOpen = !menuOpen"
      >菜单</button>
      <nav v-if="session.user && !isMarketing" id="site-nav" :class="{ open: menuOpen }" aria-label="主导航">
        <RouterLink to="/jobs" @click="menuOpen = false">找职位</RouterLink>
        <RouterLink to="/companies" @click="menuOpen = false">公司库</RouterLink>
        <RouterLink to="/knowledge" @click="menuOpen = false">面试宝典</RouterLink>
        <RouterLink to="/me/resumes" @click="menuOpen = false">简历中心</RouterLink>
        <RouterLink to="/me/workspace" @click="menuOpen = false">求职工作台</RouterLink>
      </nav>
      <template v-if="session.user">
        <div class="account">
          <button
            class="avatar-button"
            type="button"
            aria-haspopup="menu"
            :aria-expanded="accountOpen"
            :aria-label="`账号菜单：${session.user.nickname}`"
            @click="toggleAccount"
          >{{ initial }}</button>
          <div v-if="accountOpen" class="account-menu" role="menu" aria-label="账号菜单">
            <p class="menu-user">{{ session.user.nickname }}</p>
            <RouterLink to="/me/profile" role="menuitem" @click="closeAccount">个人中心</RouterLink>
            <RouterLink to="/me/workspace" role="menuitem" @click="closeAccount">求职工作台</RouterLink>
            <button v-if="!confirmLogout" class="menu-logout" type="button" role="menuitem" @click="confirmLogout = true">退出登录</button>
            <div v-else class="logout-confirm-card">
              <p>退出后将回到官网首页，数据保留：你的投递与简历记录都不会丢失。</p>
              <div class="confirm-actions">
                <button class="cancel-logout" type="button" @click="confirmLogout = false">取消</button>
                <button class="confirm-logout" type="button" @click="signOut">确认退出</button>
              </div>
            </div>
          </div>
        </div>
      </template>
      <button v-else class="cl-primary-button account-button" type="button" @click="menuOpen = false; session.requestLogin()">登录 / 注册</button>
    </div>
  </header>
  <main id="main-content"><RouterView /></main>
  <LoginDialog />
</template>
<style scoped>
.site-header{position:sticky;z-index:30;top:0;height:68px;border-bottom:1px solid color-mix(in srgb,var(--cl-border) 82%,transparent);background:color-mix(in srgb,var(--cl-surface) 92%,transparent);backdrop-filter:blur(14px)}
.header-inner{height:100%;display:flex;align-items:center;gap:28px}
nav{display:flex;align-items:center;gap:25px;margin-right:auto;color:var(--cl-muted);font-size:14px;font-weight:600}
nav a:hover,nav a.router-link-active{color:var(--cl-primary)}
.menu-toggle{display:none}
.account-button{min-height:38px;margin-left:auto}
.account{position:relative;margin-left:auto}
.avatar-button{width:38px;height:38px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--cl-primary) 34%,transparent);border-radius:50%;color:var(--cl-primary);background:var(--cl-primary-soft);font-size:15px;font-weight:800}
.avatar-button:hover{border-color:var(--cl-primary)}
.account-menu{position:absolute;top:48px;right:0;z-index:40;width:230px;padding:10px;border:1px solid var(--cl-border);border-radius:12px;background:var(--cl-surface);box-shadow:var(--cl-shadow-float)}
.menu-user{margin:2px 8px 8px;padding-bottom:8px;border-bottom:1px solid var(--cl-border);color:var(--cl-text-strong);font-size:13px;font-weight:700}
.account-menu a,.account-menu button{display:block;width:100%;padding:9px 10px;border:0;border-radius:8px;color:var(--cl-text);background:transparent;font-size:14px;text-align:left;text-decoration:none}
.account-menu a:hover,.account-menu button:hover{background:var(--cl-primary-soft);color:var(--cl-primary)}
.account-menu .menu-logout{color:#c2410c}
.logout-confirm-card{padding:10px;border-radius:9px;background:color-mix(in srgb,#f79009 12%,transparent)}
.logout-confirm-card p{margin:0 0 10px;color:var(--cl-text);font-size:12px;line-height:1.6}
.confirm-actions{display:flex;gap:8px}
.confirm-actions button{flex:1;min-height:34px;border-radius:8px;font-size:13px;font-weight:600;text-align:center}
.cancel-logout{border:1px solid var(--cl-border);color:var(--cl-text);background:var(--cl-surface)}
.confirm-logout{border:0;color:#fff;background:#c2410c}
@media(max-width:850px){
.header-inner{justify-content:space-between}
.menu-toggle{order:-1;display:inline-flex;min-height:40px;align-items:center;border:0;color:var(--cl-text);background:transparent}
nav{position:absolute;top:67px;right:14px;left:14px;order:-1;display:none;flex-direction:column;align-items:stretch;gap:0;padding:10px;border:1px solid var(--cl-border);border-radius:var(--cl-radius-md);background:var(--cl-surface);box-shadow:var(--cl-shadow-float)}
nav.open{display:flex}
nav a{padding:12px}
.account,.account-button{margin-left:0}
}
</style>
