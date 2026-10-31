import {
  BriefcaseBusiness,
  Radio,
  Send,
  Columns3,
  CalendarDays,
  ChartNoAxesCombined,
  Files,
  MessagesSquare,
  BookOpen,
  LibraryBig,
  NotebookPen,
  GraduationCap,
  ScanText,
  ListTodo,
  Wallet,
  Scale,
  Users,
  UserRound,
  Heart,
  Bell,
  Settings,
  ShieldCheck,
  Server,
  Mic,
  Building2,
} from "lucide-react";
export const navigation = [
  {
    label: "发现机会",
    items: [
      { path: "/jobs", label: "岗位广场", icon: BriefcaseBusiness },
      { path: "/subscriptions", label: "我的订阅", icon: Radio },
      { path: "/referral", label: "内推机会", icon: Send },
    ],
  },
  {
    label: "管理投递",
    items: [
      { path: "/pipeline", label: "投递看板", icon: Columns3 },
      { path: "/calendar", label: "求职日程", icon: CalendarDays },
      { path: "/analytics", label: "投递分析", icon: ChartNoAxesCombined },
      { path: "/resumes", label: "简历版本库", icon: Files },
    ],
  },
  {
    label: "面试与知识",
    items: [
      { path: "/mock", label: "模拟面试", icon: Mic },
      { path: "/experiences", label: "面经广场", icon: NotebookPen },
      { path: "/questions", label: "面试题库", icon: LibraryBig },
      { path: "/handbook", label: "求职宝典", icon: BookOpen },
    ],
  },
  {
    label: "成长与决策",
    items: [
      { path: "/resume-check", label: "简历检查", icon: ScanText },
      { path: "/planner", label: "求职规划", icon: ListTodo },
      { path: "/salary", label: "薪资参考", icon: Wallet },
      { path: "/offer-compare", label: "Offer 对比", icon: Scale },
    ],
  },
  {
    label: "一起走得更远",
    items: [
      { path: "/community", label: "求职社区", icon: MessagesSquare },
      { path: "/buddy", label: "同路人", icon: Users },
      { path: "/radar", label: "情报雷达", icon: Radio },
    ],
  },
  {
    label: "我的工作台",
    items: [
      { path: "/me", label: "个人中心", icon: UserRound },
      { path: "/submissions", label: "我的投稿", icon: NotebookPen },
      { path: "/favorites", label: "我的收藏", icon: Heart },
      { path: "/notifications", label: "通知中心", icon: Bell },
      { path: "/settings", label: "偏好设置", icon: Settings },
      { path: "/admin", label: "内容管理", icon: ShieldCheck },
      { path: "/admin/services", label: "服务管理", icon: Server },
    ],
  },
];
export const managementNavigation = [
  {
    label: "平台管理",
    items: [
      { path: "/admin/users", label: "用户管理", icon: Users },
      { path: "/admin", label: "内容管理与审核", icon: ShieldCheck },
      { path: "/admin/services", label: "服务与任务", icon: Server },
    ],
  },
  {
    label: "账号",
    items: [{ path: "/settings", label: "账号设置", icon: Settings }],
  },
];
export function navigationFor(role?: string) {
  if (role === "ADMIN") return managementNavigation;
  if (role === "REVIEWER")
    return managementNavigation.map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        ["/admin", "/settings"].includes(item.path),
      ),
    }));
  return navigation.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.path.startsWith("/admin")),
  }));
}
export const navItems = [...navigation, ...managementNavigation].flatMap(
  (g) => g.items,
);
export function titleFor(path: string) {
  const submissionTitles: Record<string, string> = {
    "/experiences/submissions": "我的面经投稿",
    "/community/submissions": "我的社区投稿",
    "/submissions/comments": "我的评论与回复",
    "/submissions/community": "我的社区投稿",
    "/salary/submissions": "我的薪资投稿",
    "/referral/submissions": "我的内推投稿",
  };
  if (submissionTitles[path]) return submissionTitles[path];
  if (path.startsWith("/company/")) return "公司情报";
  if (path.startsWith("/interview/"))
    return path.includes("review") ? "面试复盘" : "面试时间线";
  if (path.startsWith("/style/")) return "公司面试风格";
  if (path.startsWith("/pack/")) return "公司面经包";
  if (path.startsWith("/jobs/")) return "岗位详情";
  if (path.startsWith("/experiences/")) return "面经详情";
  return (
    [...navItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((x) => path === x.path || path.startsWith(x.path + "/"))?.label ||
    "校招工作台"
  );
}
