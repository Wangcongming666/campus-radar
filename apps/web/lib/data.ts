export const DEMO_NOW = '2026-10-23T09:00:00+08:00';
export type Stage =
  'PENDING' | 'APPLIED' | 'ASSESSMENT' | 'INTERVIEW_1' | 'INTERVIEW_2' | 'HR' | 'OFFER' | 'CLOSED';
export const stages: { id: Stage; label: string; color: string }[] = [
  { id: 'PENDING', label: '待投递', color: 'subtle' },
  { id: 'APPLIED', label: '已投递', color: 'status-applied' },
  { id: 'ASSESSMENT', label: '笔试', color: 'status-applied' },
  { id: 'INTERVIEW_1', label: '一面', color: 'status-interview' },
  { id: 'INTERVIEW_2', label: '二面', color: 'status-interview' },
  { id: 'HR', label: 'HR 面', color: 'status-interview' },
  { id: 'OFFER', label: 'Offer', color: 'status-offer' },
  { id: 'CLOSED', label: '已结束', color: 'status-closed' },
];
export interface Company {
  id: string;
  slug: string;
  name: string;
  en: string;
  initial: string;
  color: string;
  industry: string;
  description: string;
  size: string;
  tags: string[];
}
const mock_companies: Company[] = [
  {
    id: 'tencent',
    slug: 'tencent',
    name: '腾讯',
    en: 'Tencent',
    initial: 'T',
    color: 'blue',
    industry: '互联网',
    description: '连接人与服务，探索科技向善的无限可能。',
    size: '10000人以上',
    tags: ['大厂', '双休', '技术驱动'],
  },
  {
    id: 'bytedance',
    slug: 'bytedance',
    name: '字节跳动',
    en: 'ByteDance',
    initial: 'B',
    color: 'cyan',
    industry: '互联网',
    description: '激发创造，丰富生活。在全球化团队里创造有影响力的产品。',
    size: '10000人以上',
    tags: ['全球化', '高成长', '技术驱动'],
  },
  {
    id: 'alibaba',
    slug: 'alibaba',
    name: '阿里巴巴',
    en: 'Alibaba',
    initial: 'a',
    color: 'orange',
    industry: '互联网',
    description: '让天下没有难做的生意，用技术连接商业与未来。',
    size: '10000人以上',
    tags: ['电商', '云计算', '业务丰富'],
  },
  {
    id: 'meituan',
    slug: 'meituan',
    name: '美团',
    en: 'Meituan',
    initial: 'M',
    color: 'yellow',
    industry: '生活服务',
    description: '帮大家吃得更好，生活更好。用科技服务生活。',
    size: '10000人以上',
    tags: ['本地生活', '技术扎实', '业务稳定'],
  },
  {
    id: 'netease',
    slug: 'netease',
    name: '网易',
    en: 'NetEase',
    initial: 'N',
    color: 'red',
    industry: '互联网',
    description: '以匠心和创新，为用户创造美好的数字生活。',
    size: '10000人以上',
    tags: ['游戏', '内容', '工作氛围'],
  },
  {
    id: 'xiaomi',
    slug: 'xiaomi',
    name: '小米',
    en: 'Xiaomi',
    initial: 'mi',
    color: 'orange',
    industry: '智能硬件',
    description: '让每个人都能享受科技带来的美好生活。',
    size: '10000人以上',
    tags: ['智能硬件', '汽车', '技术创新'],
  },
  {
    id: 'ant',
    slug: 'ant',
    name: '蚂蚁集团',
    en: 'Ant Group',
    initial: 'A',
    color: 'blue',
    industry: '金融科技',
    description: '让每一个人享有普惠、绿色的金融与生活服务。',
    size: '10000人以上',
    tags: ['金融科技', '技术深度', '成长体系'],
  },
  {
    id: 'huawei',
    slug: 'huawei',
    name: '华为',
    en: 'Huawei',
    initial: 'H',
    color: 'red',
    industry: '通信科技',
    description: '把数字世界带入每个人、每个家庭、每个组织。',
    size: '10000人以上',
    tags: ['硬科技', '全球化', '研发投入'],
  },
];
export interface Job {
  id: string;
  title: string;
  companyId: string;
  department: string;
  city: string;
  role: string;
  education: string;
  type: string;
  salary: string;
  tags: string[];
  match: number;
  deadline: string | null;
  posted: string;
  highlight?: string;
  canonicalUrl?: string;
  sourceName?: string;
  collectedAt?: string | null;
  graduationYears?: number[];
  status?: string;
  description: string[];
  requirements: string[];
}
const mock_jobs: Job[] = [
  {
    id: 'job-1',
    title: '前端开发工程师',
    companyId: 'tencent',
    department: '微信事业群 · WXG',
    city: '深圳',
    role: '前端开发',
    education: '本科',
    type: '秋招',
    salary: '25–35K · 16薪',
    tags: ['React', 'TypeScript', '工程化'],
    match: 98,
    deadline: '2026-10-28',
    posted: '2小时前',
    highlight: '与你的技能高度匹配',
    description: [
      '参与微信生态核心产品的 Web 前端研发，构建流畅、可靠的用户体验。',
      '负责高质量组件库建设、前端工程化与性能优化。',
      '与产品、设计和后端团队紧密协作，推动业务创新。',
    ],
    requirements: [
      '2027届本科及以上学历，计算机相关专业。',
      '熟悉 JavaScript、TypeScript，熟练使用 React 或 Vue。',
      '理解浏览器渲染原理、HTTP 协议与前端性能优化。',
    ],
  },
  {
    id: 'job-2',
    title: '前端研发工程师 — 抖音',
    companyId: 'bytedance',
    department: '抖音 · 用户增长',
    city: '北京',
    role: '前端开发',
    education: '本科',
    type: '秋招',
    salary: '28–40K · 15薪',
    tags: ['React', 'Node.js', '可视化'],
    match: 96,
    deadline: '2026-11-02',
    posted: '3小时前',
    description: [
      '负责抖音增长相关平台与产品的前端研发。',
      '探索跨端技术和数据可视化，提升团队研发效率。',
    ],
    requirements: [
      '2027届本科及以上，具备扎实的计算机基础。',
      '熟悉 React、TypeScript，了解 Node.js。',
      '关注用户体验，有独立项目实践优先。',
    ],
  },
  {
    id: 'job-3',
    title: 'Java 研发工程师',
    companyId: 'alibaba',
    department: '淘天集团 · 技术平台',
    city: '杭州',
    role: '后端开发',
    education: '本科',
    type: '秋招',
    salary: '26–38K · 16薪',
    tags: ['Java', 'Spring', '分布式'],
    match: 89,
    deadline: '2026-10-26',
    posted: '4小时前',
    highlight: '即将截止',
    description: [
      '参与电商核心交易链路与高并发系统研发。',
      '建设分布式基础设施，保障系统稳定与性能。',
    ],
    requirements: [
      '熟练掌握 Java 与常用数据结构。',
      '理解数据库、缓存、消息队列等中间件。',
      '有良好的系统设计意识和沟通能力。',
    ],
  },
  {
    id: 'job-4',
    title: '前端开发工程师',
    companyId: 'meituan',
    department: '核心本地商业 · 到店',
    city: '北京',
    role: '前端开发',
    education: '本科',
    type: '秋招',
    salary: '24–32K · 15.5薪',
    tags: ['Vue', 'TypeScript', '小程序'],
    match: 94,
    deadline: '2026-11-08',
    posted: '5小时前',
    description: ['参与生活服务业务的多端产品研发。', '推动组件化、自动化测试与用户体验建设。'],
    requirements: ['熟悉 HTML、CSS、JavaScript 与 Vue 或 React。', '有跨端或小程序开发经验优先。'],
  },
  {
    id: 'job-5',
    title: '游戏客户端开发工程师',
    companyId: 'netease',
    department: '网易游戏 · 互娱',
    city: '广州',
    role: '客户端开发',
    education: '本科',
    type: '秋招',
    salary: '25–38K · 16薪',
    tags: ['C++', 'Unity', '图形学'],
    match: 82,
    deadline: '2026-11-12',
    posted: '昨天',
    description: ['负责游戏客户端功能与工具开发。', '参与渲染性能、资源管理及体验优化。'],
    requirements: [
      '熟悉 C++，有良好的算法与数据结构基础。',
      '热爱游戏，了解 Unity 或 Unreal 引擎。',
    ],
  },
  {
    id: 'job-6',
    title: '算法工程师 — 大模型方向',
    companyId: 'bytedance',
    department: 'Seed · AI 研究',
    city: '上海',
    role: '算法工程师',
    education: '硕士',
    type: '秋招',
    salary: '35–55K · 15薪',
    tags: ['Python', 'LLM', 'PyTorch'],
    match: 76,
    deadline: '2026-11-15',
    posted: '昨天',
    description: ['参与大模型训练、推理与对齐技术研发。', '探索模型在真实业务场景中的应用与评估。'],
    requirements: [
      '硕士及以上学历，机器学习相关方向。',
      '熟悉 PyTorch 与 NLP，有论文或开源贡献优先。',
    ],
  },
  {
    id: 'job-7',
    title: '产品经理',
    companyId: 'xiaomi',
    department: '小米汽车 · 产品体验',
    city: '北京',
    role: '产品经理',
    education: '本科',
    type: '秋招',
    salary: '20–30K · 16薪',
    tags: ['用户研究', '产品设计', '数据分析'],
    match: 85,
    deadline: '2026-11-20',
    posted: '昨天',
    description: ['参与智能汽车用户体验产品规划。', '推动需求分析、设计验证与产品迭代。'],
    requirements: ['具备用户同理心与结构化思考能力。', '熟练使用产品设计与数据分析工具。'],
  },
  {
    id: 'job-8',
    title: '前端开发实习生',
    companyId: 'ant',
    department: '支付宝 · 体验技术',
    city: '杭州',
    role: '前端开发',
    education: '本科',
    type: '实习',
    salary: '300–400元/天',
    tags: ['React', 'Ant Design', '工程化'],
    match: 95,
    deadline: null,
    posted: '今天',
    description: ['参与支付宝业务平台与组件研发。', '在导师指导下完成产品功能与技术探索。'],
    requirements: ['每周实习4天以上，持续3个月。', '熟悉 React，有个人项目优先。'],
  },
  {
    id: 'job-9',
    title: '嵌入式软件工程师',
    companyId: 'huawei',
    department: '终端 BG · 鸿蒙',
    city: '深圳',
    role: '后端开发',
    education: '本科',
    type: '秋招',
    salary: '22–35K · 16薪',
    tags: ['C/C++', 'Linux', 'HarmonyOS'],
    match: 78,
    deadline: '2026-11-10',
    posted: '今天',
    description: ['参与鸿蒙设备的软件系统研发。', '进行系统性能分析和稳定性改进。'],
    requirements: ['熟悉 C/C++ 与操作系统基本原理。', '了解 Linux，乐于解决复杂工程问题。'],
  },
  {
    id: 'job-10',
    title: '用户体验设计师',
    companyId: 'tencent',
    department: '腾讯云 · 设计中心',
    city: '深圳',
    role: '设计师',
    education: '本科',
    type: '秋招',
    salary: '22–30K · 16薪',
    tags: ['Figma', '交互设计', '用户研究'],
    match: 84,
    deadline: '2026-11-05',
    posted: '今天',
    description: ['设计云产品的交互流程与视觉体验。', '与技术团队共建可持续演进的设计系统。'],
    requirements: ['有完整的作品集和逻辑清晰的设计表达。', '熟悉 Figma，关注复杂产品体验。'],
  },
  {
    id: 'job-11',
    title: '数据分析师',
    companyId: 'meituan',
    department: '数据平台 · 商业分析',
    city: '上海',
    role: '数据分析',
    education: '硕士',
    type: '秋招',
    salary: '23–33K · 15.5薪',
    tags: ['SQL', 'Python', '统计学'],
    match: 87,
    deadline: '2026-11-18',
    posted: '今天',
    description: ['建立业务指标体系，挖掘增长机会。', '用实验和数据支持产品决策。'],
    requirements: ['熟悉 SQL 与统计分析方法。', '具备清晰的业务理解和表达能力。'],
  },
  {
    id: 'job-12',
    title: '后端开发实习生',
    companyId: 'netease',
    department: '网易云音乐 · 平台',
    city: '杭州',
    role: '后端开发',
    education: '本科',
    type: '实习',
    salary: '250–350元/天',
    tags: ['Java', 'MySQL', 'Redis'],
    match: 88,
    deadline: null,
    posted: '今天',
    description: ['参与音乐社区服务端研发。', '协助接口优化与性能监控。'],
    requirements: ['熟悉 Java、数据库与网络基础。', '每周4天及以上。'],
  },
];
export interface Application {
  id: string;
  jobId: string;
  stage: Stage;
  notes: string;
  date: string;
  version: number;
  archived?: boolean;
  resumeId?: string;
  appliedAt?: string;
  updatedAt?: string;
  history?: { id: string; from: Stage; to: Stage; at: string }[];
}
const mock_initialApplications: Application[] = [
  {
    id: 'app-1',
    jobId: 'job-1',
    stage: 'INTERVIEW_2',
    notes: '准备 React 性能优化与项目深挖；周四 14:00 二面。',
    date: '10月18日',
    version: 1,
  },
  {
    id: 'app-2',
    jobId: 'job-2',
    stage: 'INTERVIEW_1',
    notes: '一面重点：JS基础、算法和项目。',
    date: '10月19日',
    version: 1,
  },
  {
    id: 'app-3',
    jobId: 'job-3',
    stage: 'ASSESSMENT',
    notes: '笔试 120 分钟，关注动态规划。',
    date: '10月20日',
    version: 1,
  },
  {
    id: 'app-4',
    jobId: 'job-4',
    stage: 'APPLIED',
    notes: '官网投递，等待后续通知。',
    date: '10月21日',
    version: 1,
  },
  {
    id: 'app-5',
    jobId: 'job-5',
    stage: 'PENDING',
    notes: '补充游戏 Demo 后投递。',
    date: '10月22日',
    version: 1,
  },
  {
    id: 'app-6',
    jobId: 'job-8',
    stage: 'OFFER',
    notes: '已收到实习意向，确认到岗时间。',
    date: '10月22日',
    version: 1,
  },
  {
    id: 'app-7',
    jobId: 'job-7',
    stage: 'PENDING',
    notes: '更新产品作品集。',
    date: '10月22日',
    version: 1,
  },
  {
    id: 'app-8',
    jobId: 'job-9',
    stage: 'HR',
    notes: '准备职业规划和意向城市。',
    date: '10月23日',
    version: 1,
  },
];
export interface Experience {
  id: string;
  companyId: string;
  title: string;
  role: string;
  round: string;
  author: string;
  avatar: string;
  date: string;
  readTime: string;
  tags: string[];
  views: number;
  likes: number;
  excerpt: string;
  sections: { title: string; content: string }[];
}
const mock_experiences: Experience[] = [
  {
    id: 'exp-1',
    companyId: 'tencent',
    title: '腾讯 WXG 前端三面复盘：从原理到工程实践',
    role: '前端开发',
    round: '三面',
    author: '一颗努力的栗子',
    avatar: '栗',
    date: '10月22日',
    readTime: '8分钟',
    tags: ['React', '浏览器', '项目深挖'],
    views: 2486,
    likes: 128,
    excerpt: '完整记录微信事业群三轮技术面。没有偏题怪题，更多是围绕项目和基础的一层层追问。',
    sections: [
      {
        title: '面试背景',
        content:
          '2027届本科，前端方向。两个项目：协作文档平台与可视化看板。此篇为产品演示面经，不代表真实招聘经历。',
      },
      {
        title: '一面：把基础讲清楚',
        content:
          '从事件循环开始，结合 Promise、setTimeout 和渲染解释执行顺序。接着讨论闭包、原型链，以及 React 更新机制。面试官关注解释背后的原因，不止是结论。',
      },
      {
        title: '二面：项目与工程能力',
        content:
          '以协作项目为例解释状态管理、数据同步、性能指标与取舍。谈性能优化时，先给出指标、定位方法，再说优化手段。准备一个实际遇到的困难，讲清如何验证方案。',
      },
      {
        title: '三面：系统思考',
        content:
          '设计一个支持多人协作的在线编辑器。从用户场景、数据模型、并发冲突、权限到可观测性逐步展开。可以承认边界，再说明下一步如何验证。',
      },
      {
        title: '我的复盘与建议',
        content:
          '基础问题做到能举例，项目描述做到有证据。用 STAR 框架整理经历，避免只报技术名词。结束前准备两个围绕团队与成长的反问。',
      },
    ],
  },
  {
    id: 'exp-2',
    companyId: 'bytedance',
    title: '字节前端一面：90 分钟高密度技术问答',
    role: '前端开发',
    round: '一面',
    author: '小林同学',
    avatar: '林',
    date: '10月21日',
    readTime: '6分钟',
    tags: ['JavaScript', '手写题', '算法'],
    views: 1824,
    likes: 96,
    excerpt:
      '从一道事件循环输出题聊到浏览器渲染，再到手写并发控制。整理了我的思考过程和卡住的地方。',
    sections: [
      {
        title: '面试流程',
        content: '产品演示内容：自我介绍、基础问答、项目讨论、手写题和反问。共约90分钟。',
      },
      {
        title: '高频考察点',
        content: '事件循环、原型、异步并发、浏览器缓存、React Hooks。回答时用简洁示例验证推导。',
      },
      {
        title: '手写与复盘',
        content:
          '实现一个限制并发数的请求队列。先定义输入输出和错误处理，再覆盖空队列、失败重试和并发上限。',
      },
    ],
  },
  {
    id: 'exp-3',
    companyId: 'alibaba',
    title: '阿里 Java 后端秋招记录：一次完整的成长',
    role: '后端开发',
    round: '二面',
    author: '码上有 Offer',
    avatar: '码',
    date: '10月20日',
    readTime: '10分钟',
    tags: ['Java', '分布式', '数据库'],
    views: 3120,
    likes: 214,
    excerpt: '从 JVM 到 MySQL，从缓存一致性到消息可靠性。整理一套由浅入深的准备方法。',
    sections: [
      {
        title: '准备策略',
        content:
          '演示内容：按 Java、数据库、缓存、分布式和项目五个主题准备。每个主题都用真实问题串联。',
      },
      {
        title: '数据库与系统设计',
        content:
          '解释索引选择与执行计划，描述一次慢查询定位过程。讨论缓存一致性时先明确允许的不一致窗口。',
      },
      {
        title: '值得改进的地方',
        content: '项目指标要有统计口径。不能只说优化了性能，应讲清基线、目标、方法和验证。',
      },
    ],
  },
  {
    id: 'exp-4',
    companyId: 'meituan',
    title: '美团前端实习转正：项目深挖到底在问什么',
    role: '前端开发',
    round: '二面',
    author: '今天也在学习',
    avatar: '学',
    date: '10月19日',
    readTime: '7分钟',
    tags: ['工程化', '性能优化', '实习'],
    views: 1568,
    likes: 87,
    excerpt: '把一个项目讲得有深度，比准备十个项目更重要。分享我的项目梳理模板。',
    sections: [
      {
        title: '问题怎么开始',
        content: '演示内容：先聊你最熟悉的项目，再追问为什么这样设计、遇到什么问题、如何衡量收益。',
      },
      {
        title: '项目梳理模板',
        content:
          '用户场景→约束→方案比较→实施→结果→下一步。每个决策准备至少一个没有选择的替代方案。',
      },
    ],
  },
  {
    id: 'exp-5',
    companyId: 'ant',
    title: '蚂蚁体验技术面经：组件设计与开源贡献',
    role: '前端开发',
    round: '一面',
    author: '南风',
    avatar: '南',
    date: '10月18日',
    readTime: '5分钟',
    tags: ['组件设计', '开源', 'TypeScript'],
    views: 1320,
    likes: 72,
    excerpt: '聊聊如何设计一个可复用组件，以及在开源协作中学到的事情。',
    sections: [
      {
        title: '组件设计题',
        content:
          '演示内容：设计 Select 组件，关注受控状态、可访问性、键盘操作、异步数据与 API 一致性。',
      },
      {
        title: '沟通与协作',
        content: '介绍一个开源 PR 的问题背景、讨论过程和最终取舍。把反馈当作设计输入。',
      },
    ],
  },
  {
    id: 'exp-6',
    companyId: 'xiaomi',
    title: '小米产品岗：用一次体验拆解讲清产品思维',
    role: '产品经理',
    round: 'HR面',
    author: '未来产品人',
    avatar: '产',
    date: '10月17日',
    readTime: '6分钟',
    tags: ['用户研究', '产品思维', 'STAR'],
    views: 980,
    likes: 64,
    excerpt: '从用户的具体场景出发，不急着给方案。问题定义比答案更有价值。',
    sections: [
      {
        title: '产品分析',
        content: '演示内容：选一个常用功能，说明目标用户、使用场景、核心路径和衡量方式。',
      },
      {
        title: '行为面试',
        content: '用 STAR 结构讲一次协作冲突。重点是你的行动，而不是团队的概述。',
      },
    ],
  },
];
export interface Question {
  id: string;
  title: string;
  topic: string;
  difficulty: '简单' | '中等' | '困难';
  frequency: number;
  answer: string;
  companies: string[];
}
const mock_questions: Question[] = [
  {
    id: 'q-1',
    title: '说说浏览器的事件循环机制',
    topic: 'JavaScript',
    difficulty: '中等',
    frequency: 98,
    answer:
      'JavaScript 同步任务在调用栈中执行。每个任务结束后清空微任务队列，再在适当时机进行渲染。宏任务包括计时器和 I/O 回调，微任务包括 Promise 回调。用具体执行顺序说明，并注意浏览器与 Node.js 的差异。',
    companies: ['tencent', 'bytedance', 'meituan'],
  },
  {
    id: 'q-2',
    title: 'React Fiber 如何实现可中断渲染？',
    topic: 'React',
    difficulty: '困难',
    frequency: 92,
    answer:
      'Fiber 把渲染工作拆成可调度单元，借助链表保存树结构和工作状态。render 阶段可暂停和重做，commit 阶段提交更新。结合优先级与并发渲染说明用户交互如何优先响应。',
    companies: ['tencent', 'bytedance'],
  },
  {
    id: 'q-3',
    title: 'HTTP 缓存与协商缓存的区别',
    topic: '计算机网络',
    difficulty: '中等',
    frequency: 95,
    answer:
      '强缓存通过 Cache-Control 等决定是否直接复用响应；协商缓存通过 ETag/If-None-Match 或 Last-Modified/If-Modified-Since 向服务端验证，资源未变返回304。注意缓存键、Vary 与私人数据。',
    companies: ['tencent', 'ant'],
  },
  {
    id: 'q-4',
    title: '实现一个支持取消的防抖函数',
    topic: '手写代码',
    difficulty: '中等',
    frequency: 89,
    answer:
      '每次调用清除上一个计时器并安排新的调用，保留 this 与参数。暴露 cancel 方法，必要时提供 flush。覆盖连续调用、取消和组件卸载场景。',
    companies: ['bytedance', 'meituan'],
  },
  {
    id: 'q-5',
    title: '如何设计一个高性能的长列表？',
    topic: '性能优化',
    difficulty: '困难',
    frequency: 86,
    answer:
      '先测量瓶颈，再选择窗口化渲染、稳定 key、动态高度缓存与数据分页。保留滚动锚点、键盘导航和可访问性，避免仅按视觉优化。',
    companies: ['alibaba', 'ant'],
  },
  {
    id: 'q-6',
    title: 'MySQL 联合索引为什么遵循最左前缀？',
    topic: '数据库',
    difficulty: '中等',
    frequency: 94,
    answer:
      '联合索引按字段顺序构建有序 B+ 树。前导字段确定后，后续字段在范围内有序。查询是否使用索引需结合具体版本、执行计划、选择性和回表成本分析。',
    companies: ['alibaba', 'meituan'],
  },
  {
    id: 'q-7',
    title: '用 STAR 描述一次团队协作经历',
    topic: '行为面试',
    difficulty: '简单',
    frequency: 90,
    answer:
      'Situation 简述背景，Task 明确你要解决的问题，Action 具体说明你的决策和行动，Result 给出结果、反馈和反思。重点讲清个人贡献。',
    companies: ['xiaomi', 'tencent'],
  },
  {
    id: 'q-8',
    title: 'TypeScript 中 unknown 与 any 有何区别？',
    topic: 'TypeScript',
    difficulty: '简单',
    frequency: 88,
    answer:
      'any 跳过类型检查并传播不安全操作；unknown 允许接收任意值，但使用前必须进行类型收窄。外部输入优先 unknown 配合运行时校验。',
    companies: ['bytedance', 'ant'],
  },
];
const mock_chapters = [
  {
    id: 'js',
    title: 'JavaScript 核心原理',
    category: '前端开发',
    count: 12,
    content:
      '从执行上下文、作用域与闭包开始，建立对 JavaScript 运行方式的完整理解。\n\n闭包让函数可以访问其定义时的词法环境。它常用于状态封装、回调和函数式组合。理解闭包时，区分变量绑定与变量当前的值。\n\n事件循环把同步执行、异步任务与渲染连接起来。用实际示例推导执行顺序，比背诵规则更可靠。',
    sections: ['执行上下文与作用域', '闭包与内存管理', '原型与继承', '事件循环'],
  },
  {
    id: 'react',
    title: 'React 与现代前端',
    category: '前端开发',
    count: 16,
    content:
      'React 用声明式组件描述界面。将渲染看作状态的快照，理解状态更新、批处理与闭包，是学习 Hooks 的基础。\n\n不要过早使用 memo。先通过 Profiler 定位昂贵渲染，再检查状态位置、组件结构和数据引用。\n\nEffect 用于同步外部系统，派生数据通常可以在渲染时计算。为每个订阅、计时器与请求考虑清理机制。',
    sections: ['组件与状态模型', 'Hooks 深入理解', 'Fiber 与调度', '性能与工程实践'],
  },
  {
    id: 'network',
    title: '计算机网络与浏览器',
    category: '计算机基础',
    count: 10,
    content:
      '从输入 URL 到页面展示，涉及域名解析、连接建立、HTTP 请求、资源解析、布局和绘制。\n\n解释网络问题时明确层次：传输可靠性由 TCP 等协议处理，应用语义由 HTTP 定义。\n\n性能优化从测量开始。关注 LCP、INP 和 CLS，并结合真实用户数据定位瓶颈。',
    sections: ['HTTP 与缓存', 'TCP 与 TLS', '浏览器渲染', '前端安全'],
  },
  {
    id: 'project',
    title: '项目深挖回答模板',
    category: '面试方法',
    count: 8,
    content:
      '把项目整理成一条可追问的故事：场景→问题→约束→方案→结果。\n\n先回答为什么做，再说明你负责什么。对关键决策准备替代方案与取舍，给出结果的统计口径。\n\n当没有量化数据时，可以说明功能覆盖、用户反馈和可复现的对比，不要编造指标。',
    sections: ['项目全景梳理', '技术方案取舍', '困难与解决过程', '成果与反思'],
  },
  {
    id: 'star',
    title: 'STAR 行为面试法',
    category: '面试方法',
    count: 6,
    content:
      'Situation：用一两句话交代背景。\n\nTask：明确任务与成功标准。\n\nAction：重点解释你的具体行动、判断和协作。\n\nResult：说明结果、他人反馈以及下一次会如何改进。',
    sections: ['背景与任务', '行动如何具体', '结果如何可信', '常见行为题'],
  },
  {
    id: 'ask',
    title: '高质量反问清单',
    category: '面试方法',
    count: 5,
    content:
      '反问是了解团队和确认双向匹配的机会。优先围绕工作内容、协作方式和成长机制提问。\n\n可以问：新同学前3个月通常承担什么任务？团队如何做代码评审和技术分享？当前最希望解决的工程问题是什么？\n\n避免重复询问已介绍的信息，也无需用复杂问题证明自己。',
    sections: ['了解团队', '了解工作', '了解成长', '确认下一步'],
  },
];
export type Chapter = (typeof mock_chapters)[number];
const apiMode = process.env.NEXT_PUBLIC_DATA_MODE === 'api';
export let companies: Company[] = apiMode ? [] : mock_companies;
export let jobs: Job[] = apiMode ? [] : mock_jobs;
export let initialApplications: Application[] = apiMode ? [] : mock_initialApplications;
export let experiences: Experience[] = apiMode ? [] : mock_experiences;
export let questions: Question[] = apiMode ? [] : mock_questions;
export let chapters: Chapter[] = apiMode ? [] : mock_chapters;
export type Catalog = {
  companies: Company[];
  jobs: Job[];
  experiences: Experience[];
  questions: Question[];
  chapters: Chapter[];
};
/** Only the browser can hydrate this UI catalog. Server requests never mutate module state. */
export function setApiCatalog(value: Catalog) {
  if (typeof window === 'undefined') return;
  companies = value.companies;
  jobs = value.jobs;
  experiences = value.experiences;
  questions = value.questions;
  chapters = value.chapters;
}
export function resetApiCatalog() {
  if (typeof window === 'undefined') return;
  companies = [];
  jobs = [];
  experiences = [];
  questions = [];
  chapters = [];
}
const unavailableCompany: Company = {
  id: '',
  slug: '',
  name: '公司信息未提供',
  en: '',
  initial: '?',
  color: 'blue',
  industry: '',
  description: '',
  size: '',
  tags: [],
};
export const getCompany = (id: string) =>
  companies.find((c) => c.id === id || c.slug === id) ?? unavailableCompany;
export const getJob = (id: string) => jobs.find((j) => j.id === id);
