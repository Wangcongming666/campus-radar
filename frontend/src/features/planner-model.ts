import type { components } from "../api/generated";
import { parseDateValue } from "../components/DatePicker";
export type PlanTask = components["schemas"]["PlanTask"];
export type GeneratePlan = components["schemas"]["GeneratePlan"];
export const taskStatuses = { TODO: "待开始", DOING: "进行中", DONE: "已完成" } as const;
export function planInputError(target: string, hours: string, roles: string[]): string {
  if (!parseDateValue(target)) return "请选择有效的目标日期。";
  if (!hours.trim() || !Number.isInteger(Number(hours)) || Number(hours) < 1 || Number(hours) > 80) return "每周投入时间请输入 1–80 之间的整数小时。";
  if (!roles.length) return "请至少选择一个求职方向。";
  if (roles.length > 10) return "求职方向最多选择 10 个。";
  if (roles.some(role => !role.trim() || [...role].length > 40)) return "每个方向请填写 1–40 个字。";
  return "";
}
