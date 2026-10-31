import { describe, expect, it } from "vitest";
import { salaryPayload, salaryQuery, type SalaryDraft } from "./salary-model";
const scope = { companyId: "company-one", role: "backend", customRole: "", city: "上海", year: "2026" };
const draft: SalaryDraft = { ...scope, base: "", months: "", bonus: "", source: "本人Offer，税前现金，2026届" };
describe("salary report guidance and values", () => {
  it("distinguishes unknown amounts from explicitly zero bonus and converts yuan exactly", () => {
    expect(salaryPayload(draft).body).toMatchObject({ baseMonthlyMinor: null, salaryMonths: null, bonusMinor: null });
    expect(salaryPayload({ ...draft, base: "12345.67", months: "13.5", bonus: "0" }).body).toMatchObject({ baseMonthlyMinor: 1234567, salaryMonths: 13.5, bonusMinor: 0 });
  });
  it("rejects invalid years, excessive precision and out-of-contract values without a body", () => {
    for (const patch of [{ year: "11" }, { year: "2101" }, { base: "12.345" }, { base: "-1" }, { months: "0" }, { months: "25" }, { bonus: "10000000000.01" }, { source: "  " }, { city: "" }, { companyId: "" }]) {
      const result = salaryPayload({ ...draft, ...patch });
      expect(result.body).toBeUndefined(); expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    }
  });
  it("uses canonical direction values and keeps explicitly entered legacy directions unchanged", () => {
    expect(new URLSearchParams(salaryQuery(scope)).get("role")).toBe("backend");
    expect(new URLSearchParams(salaryQuery({ ...scope, role: "__custom", customRole: "旧岗位方向" })).get("role")).toBe("旧岗位方向");
    expect(salaryPayload({ ...draft, role: "__custom", customRole: "后端开发" }).body?.role).toBe("后端开发");
    expect(salaryQuery({ companyId: "", role: "", customRole: "", city: "", year: "" })).toBe("");
  });
});
