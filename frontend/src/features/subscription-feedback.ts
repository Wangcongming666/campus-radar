import { ApiError } from "../api/auth";

const yearMessage = "毕业年份请输入 2000–2100 之间的整数，例如 2027；不限年份可留空。";
const fieldMessages = new Map([
  ["name", "请填写订阅名称，最多 80 个字。"],
  ["conditions.roles", "岗位方向最多填写 10 个，每个不超过 32 个字，多个方向请用逗号分隔。"],
  ["conditions.cities", "工作城市最多填写 20 个，每个不超过 64 个字，多个城市请用逗号分隔。"],
  ["conditions.graduationYear", yearMessage],
  ["conditions.recruitmentTypes", "请选择校招或实习；不限招聘类型可全部不选。"],
  ["inApp", "请重新选择是否接收站内通知。"],
  ["email", "请重新选择是否接收邮件通知。"],
  ["enabled", "请重新选择是否启用订阅。"],
  ["version", "订阅信息已变化，请关闭窗口并刷新后重新编辑。"],
]);

export function subscriptionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
    const field = /^字段无效[：:]\s*(.*)$/.exec(error.message)?.[1];
    if (field !== undefined) {
      const path = field.replace(/^\./, "").replace(/\[\d*\]/g, "");
      return fieldMessages.get(path) ?? "订阅信息有误，请检查填写内容后重试。";
    }
  }
  return error instanceof Error ? error.message : "操作失败，请重试。";
}

export function graduationYearError(year: string): string {
  return year === "" || (/^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= 2100)
    ? ""
    : yearMessage;
}
