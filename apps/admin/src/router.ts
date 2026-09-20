import {createRouter,createWebHistory} from 'vue-router'
import AdminLayout from './layouts/AdminLayout.vue'
import ShellWelcome from './views/ShellWelcome.vue'
export const router=createRouter({history:createWebHistory(),routes:[{path:'/',component:AdminLayout,children:[{path:'',component:ShellWelcome}]}]})
