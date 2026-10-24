# 03 设计系统与组件库轻量初稿

版本：0.1。方向：精密的校招工作台；信息与行动优先，图表为决策服务。深空蓝底、青色主操作、紫色智能能力，玻璃层只用于浮层/导航/重点摘要。

## Token：实现合同

确认后所有原始值和语义 token 都定义在 `apps/web/tailwind.config.ts`。主题插件由同一份配置生成 `:root`/`.dark` 的 CSS 变量；globals.css 只使用变量，不重复维护色值。图表、Framer Motion、SVG 从这份配置导出的轻量 token 使用相同值；组件禁止散落品牌色和任意阴影。

实际实现采用 Tailwind 4.3.3，并通过 `@config "../tailwind.config.ts"` 显式加载中心配置；主题和原始 token 仍全部在 config.ts 中。原先选择的 3.4.19 在安装审计中有未修复的构建依赖漏洞，因此按实施记录迁移。shadcn/Radix 组件以兼容源码方式放入 components/ui。[Tailwind 配置兼容说明](https://tailwindcss.com/docs/upgrade-guide)。

### 色彩

| token 路径 | 暗色 | 亮色 | 用途 |
| --- | --- | --- | --- |
| colors.canvas | #0B1020 | #F4F7FB | 页面背景 |
| colors.surface.DEFAULT | #111A2E | #FFFFFF | 不透明阅读面 |
| colors.surface.raised | #17223A | #EAF0F8 | 高层卡片/选中区域 |
| colors.surface.glass | rgba(17,26,46,.78) | rgba(255,255,255,.88) | 模糊浮层底 |
| colors.foreground.DEFAULT | #EAF0FF | #15213A | 主文字 |
| colors.foreground.muted | #A3B1CC | #52627D | 次文字 |
| colors.foreground.subtle | #7D8CA8 | #61718A | 非关键辅助文字 |
| colors.border.DEFAULT | #2A3852 | #CBD5E1 | 普通边界 |
| colors.brand.500 | #22D3EE | #22D3EE | 品牌原色/图形 |
| colors.primary.DEFAULT | #22D3EE | #087C91 | 可交互前景、链接 |
| colors.primary.foreground | #06202A | #FFFFFF | 主按钮文字 |
| colors.accent.DEFAULT | #8B5CF6 | #6D28D9 | 智能能力/强调 |
| colors.status.applied | #60A5FA | #1D4ED8 | 投递中 |
| colors.status.interview | #A78BFA | #6D28D9 | 面试 |
| colors.status.offer | #34D399 | #047857 | Offer |
| colors.status.closed | #C48D96 | #944454 | 失败/结束 |
| colors.warning | #FBBF24 | #92400E | DDL、冲突提醒 |
| colors.danger | #FB7185 | #BE123C | 错误/删除 |

亮色不直接把电光青用于白底小字；原始 brand 保留不变，通过语义 primary 提升对比度。颜色必须配文字/图标；结束原因不同，通过“拒绝/撤回/过期/接受”等文字区分。

### 字体、尺寸、布局

| 类别 | token / 取值 |
| --- | --- |
| fontFamily.display | Space Grotesk + Noto Sans SC + system-ui（几何拉丁标题 + 中文后备） |
| fontFamily.sans | Noto Sans SC + PingFang SC + system-ui |
| fontFamily.mono | JetBrains Mono + ui-monospace；数字启用 tabular-nums |
| fontSize | 12/16、14/20、16/24、18/28、24/32、32/40、48/56、64/72（字号/行高） |
| spacing | 4px 基数：1=4、2=8、3=12、4=16、5=20、6=24、8=32、10=40、12=48、16=64 |
| borderRadius | control=10、card=16、panel=20、pill=9999px |
| borderWidth | default=1px、focus=2px |
| boxShadow.card | 0 8px 24px rgba(0,0,0,.14), 0 1px 0 rgba(255,255,255,.03) |
| boxShadow.overlay | 0 24px 80px rgba(0,0,0,.36) |
| boxShadow.glow | 0 0 0 1px rgba(34,211,238,.25), 0 0 24px rgba(34,211,238,.08) |
| backdropBlur.glass | 16px；低端设备退化为不透明底 |
| maxWidth.content | 1280px |
| width.sidebar / sidebarCompact / drawer | 248 / 72 / 560px |
| height.header | 72px |
| screens | sm=640、md=768、lg=1024、xl=1280、2xl=1536 |
| zIndex | base=0、sticky=20、header=30、overlay=40、drawer=50、dialog=60、command=70、toast=80 |

字体自托管/构建期缓存并使用 swap，避免运行时依赖外部字体请求。网格间距桌面 24px、手机 16px，页面左右边距 32/16px。正文阅读宽度约 680–760px。

### 动效

- duration：fast=120ms、base=180ms、page=240ms、chart=600ms、counter=700ms。
- easing：standard=cubic-bezier(.2,.8,.2,1)，exit=cubic-bezier(.4,0,1,1)。只用 opacity/transform 做页面过渡。
- 页内卡片进入最多错开 40ms，首屏总等待不超过 240ms；hover 边框微光与上移 2px；按钮有按压反馈。
- 数字进入视口后滚动一次，实时变更不过度重播；屏幕阅读器直接读最终值。
- 骨架为内容等高占位，加载延迟超过 150ms 才出现；失败替换为重试状态。
- reduced-motion 下停用计数滚动、视差、流光和位移动画；保留状态变化。Hero 粒子不作为内容载体，不抢正文注意力。

## 组件库

| 层 | 组件 | 关键约束 |
| --- | --- | --- |
| 基础 shadcn | Button、Input、Textarea、Label、Select、Combobox、Checkbox、Switch、Slider、Badge、Card、Tabs、Table、Popover、Tooltip、Dialog、Sheet、Command、DropdownMenu、Accordion、Calendar、Skeleton | 统一 variant/size/focus/disabled；品牌样式在封装层定义 |
| 壳层 | AppSidebar、AppHeader、MobileTabs、PageHeader、PageContainer、Section、ThemeToggle、UserMenu | 桌面/移动导航同一注册表；标题层级一致 |
| 反馈 | Toast（Sonner）、AsyncBoundary、InlineError、EmptyState、LoadingState、ConfirmDialog、DemoBadge、DataFreshness | loading/empty/error/partial/stale/success；错误不抹掉已有数据 |
| 导航与搜索 | CommandPalette、SearchResults、PreviewDrawer、DetailLink、Breadcrumbs、FilterBar、FilterSheet、ViewSwitcher、SortSelect、CursorPager | focus trap、ESC、回焦、深链接；URL 为筛选真值 |
| 岗位公司 | JobCard、JobRow、MatchRing、DeadlineBadge、CompanyAvatar、SourceBadge、SalaryRange、KeywordHighlight、CompanyStats | 未知/估算/来源标识；匹配分未就绪时无伪数值 |
| 投递面试 | ApplicationCard、ApplicationDrawer、KanbanBoard、CompanySwimlane、StagePicker、StageHistory、InterviewTimeline、ScheduleEvent、ConflictBadge | dnd-kit；键盘移动；版本冲突处理；阶段枚举唯一 |
| 知识 | ExperienceCard、ArticleTOC、SummaryCard、QuestionCard、KnowledgeTree、MasteryIndicator、ChapterReader、NotePanel、MarkdownEditor | 用户内容净化；摘要附来源；本地编辑缓冲 |
| 成长社区 | ResumeVersionCard、DiffViewer、MockConsole、ScoreReport、OfferColumn、WeightSlider、PostCard、BuddyCard、SignalCard | 后续阶段实现；敏感操作可撤销或确认 |
| 图表 | StatCard、AnimatedNumber、ConversionFunnel、MatchRadar、TrendChart、DistributionChart、SalaryBoxPlot、CompanyBubbleChart | Recharts 常规图；D3 只用于盒须/气泡布局；统一 ChartFrame、tooltip、legend 与空态 |

业务组件接收强类型 DTO 和动作回调，不直接访问数据库。图表的分母、样本量、时间范围必须显示；无数据不画“0 分”雷达。组件注释解释边界与原因，不复述代码。

## 空状态与通用交互

各列表页使用同一 EmptyState 合同，但拥有自己的轻量 SVG 插画和文案：岗位=未探测到信号/清空筛选；看板=空跑道/去挑岗位；面经=空笔记/换个公司；题库=题签/切换方向；收藏=书签/去探索；简历=文件夹/上传；社区=对话窗/发布；通知=铃铛/查看偏好。后续列表也必须注册专属图形与主要动作，不复用一句“暂无数据”。

操作反馈：收藏用按钮状态+Toast；保存失败保留编辑内容；看板移动失败回滚；删除/批量操作显示数量；只在真正完成后显示成功。每个异步页面有路由 loading/error，局部请求有局部错误，不让全页闪白。

## 可访问性与主题验收

Dialog/Drawer 关闭回到触发按钮；Cmd/Ctrl+K 不覆盖输入法组合事件；图标按钮有名称；至少 44px 触摸目标；看板有菜单移动替代拖拽；图表提供摘要与可展开数据表。主题首次 SSR 与客户端一致，首屏无闪烁；默认暗色，用户可选亮色/跟随系统并保存。验证实际对比度，不以 token 表代替检查结果。
