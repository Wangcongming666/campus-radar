import { expect, test } from "vitest";
import { commentAccess } from "./comment-access";
test("comment actions respect identity, authorship and role without granting management user writes", () => {
  const comment = { authorId: "owner", status: "PUBLISHED" };
  expect(commentAccess(null, comment)).toEqual({
    canPublish: false,
    canWithdraw: false,
    admin: false,
  });
  expect(commentAccess({ id: "owner", role: "USER" }, comment)).toEqual({
    canPublish: true,
    canWithdraw: true,
    admin: false,
  });
  expect(
    commentAccess({ id: "other", role: "USER" }, comment).canWithdraw,
  ).toBe(false);
  expect(commentAccess({ id: "manager", role: "ADMIN" }, comment)).toEqual({
    canPublish: false,
    canWithdraw: true,
    admin: true,
  });
  expect(commentAccess({ id: "owner", role: "REVIEWER" }, comment)).toEqual({
    canPublish: false,
    canWithdraw: false,
    admin: false,
  });
  expect(
    commentAccess(
      { id: "manager", role: "ADMIN" },
      { ...comment, status: "HIDDEN" },
    ).canWithdraw,
  ).toBe(false);
  expect(
    commentAccess(
      { id: "user", role: "USER" },
      { authorId: null, status: "PUBLISHED" },
    ).canWithdraw,
  ).toBe(false);
});
