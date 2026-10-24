import {
  BriefcaseBusiness,
  Bell,
  Users,
  HeartHandshake,
  Columns3,
  CalendarDays,
  ChartNoAxesCombined,
  Files,
  MessagesSquare,
  AudioLines,
  BookOpen,
  LibraryBig,
  ListChecks,
  NotebookPen,
  FileSearch,
  Route,
  Wallet,
  Scale,
  Rss,
  UserRound,
  Bookmark,
  Settings,
  Radio,
  Telescope,
  Ticket,
  Building2,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}
export const navigation: { label: string; items: NavItem[] }[] = [
  {
    label: '发现机会',
    items: [
      { label: '岗位广场', href: '/jobs', icon: BriefcaseBusiness, badge: '12' },
      { label: '订阅中心', href: '/subscriptions', icon: Bell },
      { label: '内推专区', href: '/referral', icon: Ticket },
    ],
  },
  {
    label: '管理投递',
    items: [
      { label: '投递看板', href: '/pipeline', icon: Columns3 },
      { label: '面试日程', href: '/calendar', icon: CalendarDays },
      { label: '数据统计', href: '/analytics', icon: ChartNoAxesCombined },
      { label: '简历版本库', href: '/resumes', icon: Files },
    ],
  },
  {
    label: '准备与成长',
    items: [
      { label: '面经广场', href: '/experiences', icon: MessagesSquare },
      { label: '高频题库', href: '/questions', icon: ListChecks },
      { label: '面试宝典', href: '/handbook', icon: BookOpen },
      { label: 'AI 模拟面试', href: '/mock', icon: AudioLines },
      { label: '简历诊断', href: '/resume-check', icon: FileSearch },
      { label: '求职规划', href: '/planner', icon: Route },
      { label: '薪资行情', href: '/salary', icon: Wallet },
      { label: 'Offer 决策', href: '/offer-compare', icon: Scale },
    ],
  },
  {
    label: '一起向前',
    items: [
      { label: '社区动态', href: '/community', icon: Rss },
      { label: '同路人', href: '/buddy', icon: Users },
      { label: '情报雷达', href: '/radar', icon: Radio },
    ],
  },
];
export const allNav = navigation
  .flatMap((group) => group.items)
  .concat([
    { label: '个人主页', href: '/me', icon: UserRound },
    { label: '我的收藏', href: '/favorites', icon: Bookmark },
    { label: '通知中心', href: '/notifications', icon: Bell },
    { label: '设置', href: '/settings', icon: Settings },
  ]);
export function routeTitle(path: string) {
  if (path.startsWith('/company/')) return '公司情报';
  if (path.startsWith('/style/')) return '公司面试风格';
  if (path.startsWith('/pack/')) return '公司面经包';
  if (path.startsWith('/interview/')) return path.endsWith('/review') ? '面试复盘' : '面试时间线';
  return (
    allNav.find((item) => path === item.href || path.startsWith(item.href + '/'))?.label ??
    '校招雷达'
  );
}
