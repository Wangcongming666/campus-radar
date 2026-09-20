import '@career-launch/ui/base.css'
import 'element-plus/dist/index.css'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
createApp(App).use(createPinia()).use(router).use(ElementPlus).mount('#app')
