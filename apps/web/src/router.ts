import { createRouter, createWebHistory } from 'vue-router'
import PublicLayout from './layouts/PublicLayout.vue'
import ShellWelcome from './views/ShellWelcome.vue'
export const router = createRouter({ history: createWebHistory(), scrollBehavior:()=>({top:0}), routes:[{path:'/',component:PublicLayout,children:[{path:'',name:'home',component:ShellWelcome}]}] })
