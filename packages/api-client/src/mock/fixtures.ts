import type {
  Article,
  Company,
  Job,
  Notification,
  Question,
  RecruitmentSeason,
  Resume,
  User,
} from '@career-launch/shared'

const companySeeds = [
  ['星海科技', '互联网', '民营', '上海'],
  ['云帆智能', '人工智能', '民营', '杭州'],
  ['北辰银行', '金融', '股份制', '北京'],
  ['青禾消费', '消费品', '民营', '广州'],
  ['远山汽车', '智能制造', '民营', '上海'],
  ['矩阵通信', '通信', '公众公司', '深圳'],
  ['知行教育', '教育科技', '民营', '北京'],
  ['江河能源', '新能源', '国有', '南京'],
  ['微光医疗', '医疗科技', '民营', '苏州'],
  ['恒川物流', '物流', '民营', '成都'],
  ['经纬咨询', '咨询', '合伙制', '上海'],
  ['栖木文创', '文化传媒', '民营', '武汉'],
] as const

export const seasons: RecruitmentSeason[] = [
  { id: 'season-2027-autumn', name: '2027 届秋招', year: 2027, type: 'autumn', startsAt: '2026-07-01T00:00:00Z', endsAt: '2026-12-31T15:59:59Z', active: true },
  { id: 'season-2027-early', name: '2027 届提前批', year: 2027, type: 'early', startsAt: '2026-05-01T00:00:00Z', endsAt: '2026-08-31T15:59:59Z', active: false },
]

export const companies: Company[] = companySeeds.map(([name, industry, ownership, city], index) => ({
  id: `company-${String(index + 1).padStart(3, '0')}`,
  name,
  shortName: name.slice(0, 2),
  logoText: name.slice(0, 1),
  industry,
  scale: index % 3 === 0 ? '10000人以上' : index % 3 === 1 ? '1000-9999人' : '100-999人',
  ownership,
  cities: [city],
  summary: `专注${industry}领域，为应届生提供系统培养与真实业务机会。`,
  description: `${name}持续投入人才培养，校招生将参与核心项目，并获得导师、轮岗与专业培训支持。`,
  websiteUrl: `https://example.com/companies/${index + 1}`,
  careersUrl: `https://example.com/careers/${index + 1}`,
  status: 'active',
  featured: index < 6,
}))

const roles = [
  ['后端开发工程师', '技术', ['本科', '硕士']],
  ['产品经理培训生', '产品', ['本科', '硕士']],
  ['数据分析师', '数据', ['本科', '硕士']],
] as const

export const jobs: Job[] = companies.flatMap((company, companyIndex) =>
  roles.map(([title, category, education], roleIndex) => {
    const number = companyIndex * roles.length + roleIndex + 1
    return {
      id: `job-${String(number).padStart(3, '0')}`,
      companyId: company.id,
      companyName: company.name,
      companyLogoText: company.logoText,
      seasonId: 'season-2027-autumn',
      title,
      category,
      city: company.cities,
      education: [...education],
      majors: roleIndex === 0 ? ['计算机', '软件工程', '不限'] : ['不限'],
      salaryLabel: '薪资面议',
      description: `加入${company.name}的${title}团队，参与真实业务项目，从需求理解到结果复盘完成闭环。`,
      requirements: ['2027 届本科及以上学历', '具备良好的学习能力与沟通意识', '认可长期主义并能对结果负责'],
      applyUrl: `https://example.com/apply/${number}`,
      sourceLabel: '企业招聘官网',
      publishedAt: new Date(Date.UTC(2026, 8, 20 - (number % 12))).toISOString(),
      updatedAt: new Date(Date.UTC(2026, 8, 20 - (number % 5))).toISOString(),
      deadlineAt: new Date(Date.UTC(2026, 9, 1 + (number % 28), 15, 59, 59)).toISOString(),
      status: 'active',
      featured: number <= 8,
      favorite: false,
    }
  }),
)

export const articles: Article[] = Array.from({ length: 8 }, (_, index) => ({
  id: `article-${String(index + 1).padStart(3, '0')}`,
  title: ['技术面试如何讲清项目经历', '群面中的有效表达框架', '行为面试的 STAR 方法', '校招网申信息检查清单'][index % 4] ?? '校招准备指南',
  summary: '从面试官关注点出发，整理可直接练习的准备步骤与复盘方法。',
  body: '面试准备的重点不是背诵固定答案，而是建立清晰、可信、可追问的表达结构。\n\n先写下背景与目标，再说明你的具体行动，最后用结果和复盘收束。',
  category: index % 2 === 0 ? '面试方法' : '求职准备',
  tags: ['校招', index % 2 === 0 ? '技术面' : '通用能力'],
  readingMinutes: 6 + index,
  publishedAt: new Date(Date.UTC(2026, 8, 18 - index)).toISOString(),
  featured: index < 4,
  favorite: false,
}))

export const questions: Question[] = Array.from({ length: 24 }, (_, index) => ({
  id: `question-${String(index + 1).padStart(3, '0')}`,
  prompt: index % 2 === 0 ? '请介绍一个你主导解决的复杂问题。' : '如何设计一个高并发的职位搜索接口？',
  referenceApproach: index % 2 === 0 ? '用背景、目标、行动、结果和复盘组织答案，并明确你个人承担的部分。' : '先澄清查询维度和一致性要求，再讨论索引、缓存、分页、降级和观测指标。',
  category: index % 2 === 0 ? '通用能力' : '技术',
  stage: index % 3 === 0 ? 'HR 面' : '专业面',
  difficulty: index % 3 === 0 ? '基础' : index % 3 === 1 ? '进阶' : '困难',
  tags: [index % 2 === 0 ? '行为面试' : '系统设计'],
  favorite: false,
}))

export const student: User = {
  id: 'user-student-001',
  email: 'student@example.com',
  nickname: '林同学',
  graduationYear: 2027,
  school: '启程大学',
  education: '本科',
  major: '计算机科学与技术',
  targetRoles: ['后端开发', '数据分析'],
  status: 'active',
  role: 'student',
}

export const operators: User[] = [
  { ...student, id: 'user-admin-001', email: 'admin@example.com', nickname: '超级管理员', role: 'super_admin' },
  { ...student, id: 'user-operator-001', email: 'operator@example.com', nickname: '内容运营', role: 'content_operator' },
]

export const resumes: Resume[] = [
  {
    id: 'resume-001', userId: student.id, name: '后端开发求职简历', template: 'classic', accentColor: '#315cf5',
    profile: { name: '林启程', email: student.email, phone: '138 0000 0000', city: '上海', targetRole: '后端开发工程师' },
    education: [{ id: 'education-001', title: '启程大学', subtitle: '计算机科学与技术 · 本科', startsAt: '2023-09', endsAt: '2027-06', description: 'GPA 3.7/4.0，专业前 15%。' }],
    internships: [], projects: [], skills: ['Java', 'Spring Boot', 'MySQL'], honors: ['校级一等奖学金'], summary: '重视工程质量，善于把复杂问题拆解为可验证步骤。',
    updatedAt: '2026-09-20T04:00:00Z', version: 1,
  },
]

export const notifications: Notification[] = [
  { id: 'notification-001', title: '职位即将截止', body: '星海科技后端开发工程师将在 3 天后截止。', type: 'deadline', read: false, createdAt: '2026-09-20T04:00:00Z', href: '/jobs/job-001' },
]
