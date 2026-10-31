type Actor = { id: string; role: string } | null | undefined;
export function commentAccess(
  actor: Actor,
  comment?: { authorId: string | null; status: string },
) {
  const admin = actor?.role === "ADMIN";
  const canPublish = actor?.role === "USER";
  return {
    canPublish,
    canWithdraw:
      !!actor &&
      comment?.status === "PUBLISHED" &&
      (admin || (canPublish && comment.authorId === actor.id)),
    admin,
  };
}
