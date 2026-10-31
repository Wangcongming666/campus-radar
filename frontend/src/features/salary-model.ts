import type { Schema } from "../api/personal";
export const salaryRoles = [
  ["backend", "后端开发"], ["frontend", "前端开发"], ["algorithm", "算法与数据结构"], ["product", "产品"],
  ["design", "设计"], ["test", "测试开发"], ["data", "数据分析"], ["operations", "运营"],
] as const;
export type SalaryScope = { companyId: string; role: string; customRole: string; city: string; year: string };
export type SalaryDraft = SalaryScope & { base: string; months: string; bonus: string; source: string };
export function salaryRole(scope: SalaryScope) { return (scope.role === "__custom" ? scope.customRole : scope.role).trim(); }
export function salaryQuery(scope: SalaryScope) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries({ companyId: scope.companyId, role: salaryRole(scope), city: scope.city.trim(), year: scope.year.trim() })) if (value) query.set(key, value);
  return query.toString();
}
export function salaryScopeErrors(scope: SalaryScope, required = false) {
  const errors: Record<string, string> = {};
  if (required && !scope.companyId) errors.companyId = "请选择这份薪资对应的公司。";
  const role = salaryRole(scope);
  if ((required || scope.role === "__custom") && !role) errors.role = "请填写具体岗位方向。";
  if (role.length > 40) errors.role = "方向请控制在40字以内。";
  if (required && !scope.city.trim()) errors.city = "请填写这份工作的所在城市。";
  if (scope.city.trim().length > 64) errors.city = "城市请控制在64字以内。";
  if ((required || scope.year.trim()) && (!/^\d{4}$/.test(scope.year) || Number(scope.year) < 2000 || Number(scope.year) > 2100)) errors.year = "请填写2000–2100之间的四位年份，例如2026。";
  return errors;
}
function money(value: string): number | null | undefined {
  if (!value.trim()) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor <= 1_000_000_000_000 ? minor : undefined;
}
export function salaryPayload(draft: SalaryDraft): { body?: Schema<"SalaryInput">; errors: Record<string, string> } {
  const errors = salaryScopeErrors(draft, true);
  const base = money(draft.base.trim()), bonus = money(draft.bonus.trim());
  const months = draft.months.trim() ? Number(draft.months) : null;
  if (base === undefined) errors.base = "月薪须为非负金额，最多两位小数，且不超过100亿元。";
  if (bonus === undefined) errors.bonus = "奖金须为非负金额，最多两位小数，且不超过100亿元。";
  if (months !== null && (!/^\d+(\.\d+)?$/.test(draft.months.trim()) || !Number.isFinite(months) || months < 1 || months > 24)) errors.months = "薪资月数请填写1–24，例如12、13或13.5；未知请留空。";
  if (!draft.source.trim()) errors.source = "请说明消息来源、适用年份及税前或税后口径。";
  if (draft.source.trim().length > 1000) errors.source = "来源说明请控制在1000字以内。";
  if (Object.keys(errors).length) return { errors };
  return { errors, body: { companyId: draft.companyId, role: salaryRole(draft), city: draft.city.trim(), year: Number(draft.year), baseMonthlyMinor: base!, salaryMonths: months, bonusMinor: bonus!, sourceNote: draft.source.trim() } };
}
