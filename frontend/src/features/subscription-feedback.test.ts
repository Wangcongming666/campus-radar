import { expect, test } from "vitest";
import { ApiError } from "../api/auth";
import { subscriptionErrorMessage, graduationYearError } from "./subscription-feedback";

test("subscription validation errors explain how to fix the field without exposing paths", () => {
  for (const field of ["conditions.graduationYear", ".conditions.roles[]", "conditions.cities[1]", "name", "conditions.recruitmentTypes[]", "conditions.futureField"]) {
    const message = subscriptionErrorMessage(new ApiError(422, "VALIDATION_ERROR", `字段无效：${field}`));
    expect(message).not.toContain(field);
    expect(message).not.toContain("字段无效");
    expect(message).toMatch(/请|最多|选择/);
  }
  expect(subscriptionErrorMessage(new ApiError(422, "VALIDATION_ERROR", "字段无效：conditions.graduationYear"))).toContain("2000–2100");
});

test("non-validation subscription failures keep the actual recovery message", () => {
  expect(subscriptionErrorMessage(new ApiError(409, "CONFLICT", "订阅已更新，请刷新后重试。"))).toBe("订阅已更新，请刷新后重试。");
  expect(subscriptionErrorMessage(new Error("后端连接不可用，请确认服务已启动后重试。"))).toContain("后端连接不可用");
});

test("graduation year permits no restriction and contract boundary years, rejects malformed years", () => {
  for (const value of ["", "2000", "2027", "2100"]) expect(graduationYearError(value)).toBe("");
  for (const value of ["11", "1999", "2101", "2027.5", "NaN"]) expect(graduationYearError(value)).toContain("毕业年份");
});
