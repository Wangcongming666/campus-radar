import { describe, expect, it } from "vitest";
import {
  buildOffersCsv,
  offerAnnualCash,
  offerEditorDimensions,
} from "./offer-guidance";
import type { Schema } from "../api/personal";

describe("Offer calculation guidance follows backend data", () => {
  it("keeps unknown distinct from a confirmed zero and uses decimal month arithmetic", () => {
    expect(
      offerAnnualCash({
        baseMonthlyMinor: 1500000,
        salaryMonths: 14,
        bonusMinor: null,
      }),
    ).toBeNull();
    expect(
      offerAnnualCash({
        baseMonthlyMinor: 1500000,
        salaryMonths: 14,
        bonusMinor: 0,
      }),
    ).toBe(21000000);
    expect(
      offerAnnualCash({
        baseMonthlyMinor: 100,
        salaryMonths: 1.15,
        bonusMinor: 0,
      }),
    ).toBe(115);
    expect(
      offerAnnualCash({
        baseMonthlyMinor: 101,
        salaryMonths: 1.15,
        bonusMinor: 0,
      }),
    ).toBe(116);
  });
  it("preserves historical custom dimensions without exceeding the 20-dimension contract", () => {
    expect(
      offerEditorDimensions([{ dimension: "团队氛围", score: 80 }]).map(
        (d) => d.key,
      ),
    ).toContain("团队氛围");
    const many = Array.from({ length: 20 }, (_, i) => ({
      dimension: `偏好${i}`,
      score: null,
    }));
    expect(offerEditorDimensions(many).map((d) => d.key)).toEqual(
      many.map((d) => d.dimension),
    );
  });
  it("exports only server scores, blank unknown cash, Chinese status, and safe spreadsheet text", () => {
    const offer: Schema<"Offer"> = {
      id: "a",
      version: 1,
      createdAt: "",
      updatedAt: "",
      applicationId: null,
      companyName: "=SUM(1)",
      title: "研发",
      city: "上海",
      baseMonthlyMinor: 1500000,
      salaryMonths: 14,
      bonusMinor: null,
      equityNote: "",
      benefits: "",
      expiresAt: null,
      status: "PENDING",
      scores: [{ dimension: "salary", score: 90 }],
    };
    const csv = buildOffersCsv([offer], {
      version: 0,
      offerIds: [],
      weights: [],
      results: [],
    });
    expect(csv).toContain('"\'=SUM(1)"');
    expect(csv).toContain('"15000","14","","","","","待决定"');
    expect(csv).not.toContain('"90"');
  });
});
