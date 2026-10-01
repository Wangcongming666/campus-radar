<script setup lang="ts">
import { useSessionStore } from '../../stores/session'
import LandingPage from '../marketing/LandingPage.vue'
import HomePage from './HomePage.vue'

const session = useSessionStore()
</script>
<template>
  <HomePage v-if="session.user" />
  <LandingPage v-else @login="session.requestLogin()" />
</template>
