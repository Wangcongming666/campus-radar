import { expect, test } from "vitest";
import { composePractice, type PracticeQuestion } from "./practice-banks";

const question = (id: string, role: string, difficulty: PracticeQuestion["difficulty"], tags: string[]): PracticeQuestion => ({
  id, role, difficulty, tags, title: id, promptMd: "题目", answerMd: "参考", companyIds: [], chapterId: null,
  status: "PUBLISHED", version: 1, createdAt: "2026-10-30T00:00:00Z", updatedAt: "2026-10-30T00:00:00Z",
});
const questions = [
  question("f1", "frontend", "EASY", ["JavaScript"]), question("f2", "frontend", "EASY", ["JavaScript"]),
  question("b1", "backend", "MEDIUM", ["数据库"]), question("f3", "frontend", "MEDIUM", ["React"]),
  question("f4", "frontend", "HARD", ["性能"]),
];

test("one bank produces a varied practice without mixing roles or duplicating questions", () => {
  const selected = composePractice(questions, "frontend", { count: 3 }, () => 0.5);
  expect(selected).toHaveLength(3);
  expect(selected.every(q => q.role === "frontend")).toBe(true);
  expect(new Set(selected.map(q => q.id)).size).toBe(3);
  expect(new Set(selected.map(q => q.difficulty)).size).toBe(3);
});

test("topic and difficulty filters never fall back to unrelated questions", () => {
  expect(composePractice(questions, "frontend", { count: 10, topic: "React", difficulty: "MEDIUM" }).map(q => q.id)).toEqual(["f3"]);
  expect(composePractice(questions, "frontend", { count: 10, topic: "数据库" })).toEqual([]);
});

test("small banks use available questions and large banks respect the session limit", () => {
  expect(composePractice(questions, "backend", { count: 10 })).toHaveLength(1);
  const many = Array.from({ length: 35 }, (_, i) => question(`f${i}`, "frontend", "EASY", ["JavaScript"]));
  expect(composePractice(many, "frontend", { count: 100 })).toHaveLength(30);
  expect(composePractice(many, "frontend", { count: 0 })).toEqual([]);
});
