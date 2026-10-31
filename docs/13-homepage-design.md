# 首页扩展与动效

首页保留品牌、英雄区、功能入口、FAQ 与样例展示边界；本文说明当前页面设计与素材来源。

## 页面结构与方向

面向初次了解校招雷达的学生，让岗位、投递与准备串成一段可探索的旅程。沿用深蓝、青色、现有字体与浅色主题；新增区域使用大字叙事、宽幅实屏、方向清单和摄影，避免全部变成相同卡片。

首屏保留左侧价值说明和右侧看板预览，主操作进入岗位工作台。下方新增滚动文字段落；原静态流程升级为三阶段粘性叙事；增加横向产品画廊、三个方向的准备清单、图书馆摄影与鼠标跟随预览。

## 动效职责

- 页面阅读进度：顶部细线跟随原生滚动。
- 文字显色：阅读位置推动遮罩，静态文字默认可见。
- 求职旅程：桌面粘性区域以滚动切换三个实屏与说明，也可用按钮/方向键；手机与减少动态模式直接切换。
- 产品画廊：桌面纵向滚动驱动横向展开，不劫持滚轮；手机/减少动态模式使用原生横向浏览与前后按钮。
- 摄影与鼠标预览：主图保留；细指针悬停显示随鼠标移动的原创情境摄影，按远方/日常/出发三行切换；该区域不再重复产品功能截图；粗指针/减少动态模式关闭悬浮图。
- 局部出现：标题/摄影分别用位移或裁切，默认内容可见，脚本退出不留下不可读页面。监听统一为一个被动滚动事件与requestAnimationFrame，滚动不逐帧触发React渲染。

准备清单按方向保存本地勾选，切换不相互覆盖。只反映本人勾选，不虚构平台用户数量、求职成绩或客户证言。

## 图像来源

`frontend/public/landing/discover.jpg`、`progress.jpg`、`prepare.jpg`：从当前重构版本运行页面截取的真实前端画面，使用合成样例数据。不是未来产品效果图；它们仅用于前面的求职旅程与产品画廊，不用于情境区悬浮图。

`frontend/public/landing/quiet-preparation.png`：使用内置Imagegen生成的原创情境摄影，不是真实学生见证或拍摄记录。生成原件保留在Codex生成目录，项目保存独立副本。提示词如下：

> Use case: photorealistic-natural. Asset type: one editorial landscape photograph for the landing page of 校招雷达, a Chinese university graduate career preparation workspace. Create a cinematic yet quiet and credible photograph, 1536 by 1024 landscape. Scene: after sunset inside a modern Chinese university library, a carefully composed close three-quarter view of a large warm oak study desk in the foreground, an open unbranded laptop with a very soft indistinct dark screen (no legible interface), a handwritten notebook with subtle unreadable writing and a pencil, a warm small desk lamp at left. In the middle distance a single East Asian university graduate student, age about 23, wearing a navy overshirt, sits quietly looking out through tall architectural windows toward a blue-hour city skyline and a softly illuminated campus walkway. Student is side/back view, face is not a focal point. Strong architectural composition, desk and notebook crisp, person and city slightly soft, sophisticated natural photographic grain, realistic materials. Deep midnight navy shadows, muted teal-blue windows, amber lamplight, calm hopeful mood. Premium documentary editorial photography, genuine human atmosphere, no stock-photo handshake, no dramatic neon, no futuristic effects, no additional people, no UI collage, no split panels, no logo, no brand, no title, no watermark. This image will be shown as a photographic editorial panel and move slightly with the pointer; allow a little breathing room at all edges.

## 验收

对应 `frontend/e2e/homepage.spec.ts`：五宽度、图像载入、滚动阶段与横向展开、键盘选方向、记录刷新保留、指针跟随与切图、减少动态模式。实际执行结果见 [最新交接](HANDOFF.md)。

## 2026-10-27 情境区修订

用户认为悬浮实屏重复已有功能，改为情绪与意象表达。标题改为“每一种未来，都从此刻生长”，三行分别为“远方，总值得想象”“日常，也正在发光”“出发，不必等到完美”。链接目的地与鼠标跟随交互保持；原图书馆主图继续使用。

新增三张内置Imagegen原创情境图，不是实拍见证。生成原件保留在Codex生成目录，项目部署副本仅转码为JPEG以减小下载量，未修改图像内容。模块即将进入视口时预载，悬浮时切换：

| 项目保存路径 | 画面与含义 |
| --- | --- |
| frontend/public/landing/moment-direction.jpg | 晨光中的校园阶梯，表达远方与方向 |
| frontend/public/landing/moment-accumulation.jpg | 暖灯下的纸笔与书，表达日常积累 |
| frontend/public/landing/moment-courage.jpg | 走出门廊迎向晨光，表达出发与勇气 |

以下公共提示词与对应Scene拼接即为各图实际提示词：

> Use case: photorealistic-natural. Asset type: original landscape editorial photograph for the cursor-follow gallery of 校招雷达, a Chinese graduate career landing page. Landscape 1536x1024. Premium cinematic architectural/editorial photography, realistic tactile detail, thoughtful hopeful mood, deep midnight navy and muted blue-teal with restrained warm amber sunlight. It must be an evocative real-world scene, NOT a product screenshot, dashboard, interface, infographic, computer screen, or promotional text. No logos, readable text, watermark, visual collage, or split panels. The image must work as a small 330px-wide floating image, with a strong legible composition.

**direction**

> Scene: a quiet monumental outdoor stairway at a modern Chinese university, seen from its bottom toward the luminous open sky just after dawn. Elegant pale stone stairs framed by dark blue architectural walls, one small student in a dark jacket seen from behind walking toward the light at the top. Direction, open possibility, a path chosen for oneself. Geometric leading lines, peaceful spacious framing, soft golden morning light on stone edges, genuine photographic composition. Avoid a literal arrow or a compass graphic.

**accumulation**

> Scene: an intimate close-up of a wooden desk by a tall library window at blue hour. A well-used open cream notebook with subtle unreadable pencil marks, a pencil, three neatly arranged small books with blank dark blue covers, and beautiful warm lamplight falling across textured paper. Beyond the window, softly blurred blue campus trees. No laptop or phone. Strong still-life composition, physical everyday effort and accumulated thought, shallow depth of field, warm amber highlights with rich navy surroundings. Avoid digital elements and overly busy objects.

**courage**

> Scene: an atmospheric view of a young East Asian graduate aged about 23, seen from behind in a dark navy coat with a simple canvas shoulder bag, stepping out of a tall modern university doorway toward a sunlit tree-lined campus path in the morning. Strong architectural framing, pale warm light at the far end, dark teal shade in foreground, a gentle breeze moving a few leaves, calm confidence and a new beginning. Human figure small but clearly visible, no identifiable face, documentary credibility, not a staged business portrait. No handshake, office meeting, interview scene, or business logos.
