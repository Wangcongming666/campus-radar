<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useSessionStore } from '../../stores/session'

const session = useSessionStore()
const router = useRouter()

async function start() {
  if (session.user) await router.push('/me/workspace')
  else session.requestLogin()
}
</script>
<template>
  <div class="landing">
    <section class="hero">
      <div class="cl-container hero-inner">
        <p class="eyebrow">面向高校应届生的一站式求职平台</p>
        <h1>把复杂的校招，<br />变成清晰的下一步</h1>
        <p class="lead">可信职位、专业简历与投递进度，在一个地方完成。覆盖秋招、春招、提前批与补录。</p>
        <button class="cl-primary-button cta" type="button" @click="start">{{ session.user ? '进入求职工作台' : '登录 / 注册' }}</button>
        <small class="demo-note">演示环境：邮箱验证码登录，验证码见登录框提示。</small>
      </div>
    </section>

    <section class="cl-container section">
      <h2>启程校招能为你做什么</h2>
      <div class="cards">
        <article class="cl-card">
          <span class="card-icon" aria-hidden="true">🔎</span>
          <h3>职位与公司库</h3>
          <p>运营人工维护的校招职位与公司信息，按城市、学历与岗位类别筛选，截止时间一目了然。</p>
        </article>
        <article class="cl-card">
          <span class="card-icon" aria-hidden="true">📈</span>
          <h3>投递进度管理</h3>
          <p>从网申到 Offer 的每个阶段都有记录与提醒，临近截止主动提醒你跟进。</p>
        </article>
        <article class="cl-card">
          <span class="card-icon" aria-hidden="true">📄</span>
          <h3>专业简历工具</h3>
          <p>结构化编辑简历，多模板实时预览，一键导出 PDF 投递。</p>
        </article>
      </div>
    </section>

    <section class="cl-container section">
      <h2>适合谁使用</h2>
      <p class="audience">正在准备秋招、春招、提前批或补录的高校应届生；已毕业但仍参与校园招聘的同学同样欢迎。</p>
    </section>

    <footer class="site-footer">
      <div class="cl-container footer-inner">
        <div>
          <strong>联系我们</strong>
          <p>邮箱：hello@qicheng.example.com</p>
          <p>公众号：启程校招（演示）</p>
          <p>办公地点：上海市杨浦区创智天地（演示）</p>
        </div>
        <p class="legal">本站为产品演示环境，页面内容与联系方式均为虚构示例。</p>
      </div>
    </footer>
  </div>
</template>
<style scoped>
.hero{padding:88px 0 72px;border-bottom:1px solid var(--cl-border);background:linear-gradient(135deg,var(--cl-primary-soft),var(--cl-surface) 58%)}
.eyebrow{margin:0 0 12px;color:var(--cl-primary);font-weight:700}
h1{margin:0;color:var(--cl-text-strong);font-size:clamp(38px,5vw,58px);line-height:1.12;letter-spacing:-.045em}
.lead{max-width:56ch;margin:20px 0 26px;color:var(--cl-muted);font-size:17px}
.cta{min-height:46px;padding:0 26px;font-size:16px}
.demo-note{display:block;margin-top:12px;color:var(--cl-subtle);font-size:12px}
.section{padding-top:56px}
.section h2{margin:0 0 18px;color:var(--cl-text-strong);font-size:28px;letter-spacing:-.03em}
.cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.cards>article{display:grid;gap:8px;padding:24px}
.card-icon{color:var(--cl-primary);font-size:26px}
.cards h3{margin:0;font-size:17px}
.cards p{margin:0;color:var(--cl-muted);font-size:14px;line-height:1.7}
.audience{max-width:64ch;margin:0;color:var(--cl-muted);font-size:15px;line-height:1.8}
.site-footer{margin-top:72px;padding:34px 0;border-top:1px solid var(--cl-border);background:var(--cl-surface)}
.footer-inner{display:grid;gap:10px}
.footer-inner strong{color:var(--cl-text-strong)}
.footer-inner p{margin:4px 0;color:var(--cl-muted);font-size:13px}
.legal{color:var(--cl-subtle);font-size:12px}
@media(max-width:760px){.hero{padding:52px 0}.cards{grid-template-columns:1fr}}
</style>
