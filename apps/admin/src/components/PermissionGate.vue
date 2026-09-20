<script setup lang="ts">import type{AdminRole}from'@career-launch/shared';defineProps<{allow:AdminRole[];currentRole:AdminRole}>()</script>
<template><slot v-if="allow.includes(currentRole)"/></template>
