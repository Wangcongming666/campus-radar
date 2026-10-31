import { expect, test } from "vitest";
import { planInputError } from "./planner-model";
test("plan generation rejects invalid dates and out-of-contract effort without inventing defaults", () => {
  expect(planInputError("2026-02-30", "8", ["后端开发"])).toContain("日期");
  for (const hours of ["", "0", "81", "1.5"]) expect(planInputError("2027-01-01", hours, ["后端开发"])).toContain("1–80");
  expect(planInputError("2027-01-01", "8", [])).toContain("方向");
  expect(planInputError("2027-01-01", "8", Array.from({length:11}, (_,i)=>`方向${i}`))).toContain("10");
  expect(planInputError("2027-01-01", "8", ["a".repeat(41)])).toContain("40");
});
test("plan generation accepts both effort boundaries and valid leap dates", () => {
  for (const hours of ["1", "80"]) expect(planInputError("2028-02-29", hours, ["前端开发", "后端开发"])).toBe("");
});
