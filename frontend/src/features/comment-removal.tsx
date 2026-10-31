import { useEffect, useRef, useState } from "react";
import { useAccount } from "../app/api-shell";
import { apiRequest } from "../api/auth";
import { Button, Field, Modal } from "../components/ui";
import { commentAccess } from "./comment-access";
import "./comment-removal.css";
type Comment = {
  id: string;
  version: number;
  authorId: string | null;
  status: string;
};
export function CommentRemoval({
  comment,
  topic,
  onRemoved,
}: {
  comment: Comment;
  topic?: { kind: "posts" | "experiences"; id: string };
  onRemoved: () => void;
}) {
  const { user } = useAccount();
  const access = commentAccess(user, comment);
  return user && access.canWithdraw ? (
    <Removal
      key={`${user.id}:${user.role}:${comment.id}`}
      comment={comment}
      topic={topic}
      admin={access.admin}
      onRemoved={onRemoved}
    />
  ) : null;
}
function Removal({
  comment,
  topic,
  admin,
  onRemoved,
}: {
  comment: Comment;
  topic?: { kind: "posts" | "experiences"; id: string };
  admin: boolean;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const lifetime = useRef(new AbortController()),
    locked = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);
  return (
    <>
      <Button
        variant="ghost"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        撤回评论
      </Button>
      <Modal
        open={open}
        title={admin ? "管理员撤回评论" : "撤回评论"}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <form
          className="stack comment-removal-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (locked.current || (admin && !reason.trim())) return;
            locked.current = true;
            setBusy(true);
            setError("");
            const signal = lifetime.current.signal;
            try {
              const path = admin
                ? `/api/v1/admin/comments/${comment.id}`
                : topic
                  ? `/api/v1/${topic.kind}/${topic.id}/comments/${comment.id}?version=${comment.version}`
                  : `/api/v1/me/comments/${comment.id}?version=${comment.version}`;
              await apiRequest(path, {
                method: "DELETE",
                signal,
                body: admin
                  ? JSON.stringify({
                      version: comment.version,
                      reason: reason.trim(),
                    })
                  : undefined,
              });
              if (!signal.aborted) {
                setOpen(false);
                onRemoved();
              }
            } catch (failure) {
              if (!signal.aborted)
                setError(
                  failure instanceof Error
                    ? `${failure.message} 当前输入已保留；如版本变化，请关闭并刷新评论后重试。`
                    : "撤回失败，请重试。",
                );
            } finally {
              if (!signal.aborted) {
                locked.current = false;
                setBusy(false);
              }
            }
          }}
        >
          <p>
            {admin
              ? "作为管理员，可撤回任何人的评论。操作会记录处理原因与审计。"
              : "只能撤回自己的评论。"}
            正文将被清除，无法恢复；已有回复会保留。
          </p>
          {admin && (
            <Field label="处理原因">
              <textarea
                aria-label="处理原因"
                className="input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={1000}
                rows={4}
                disabled={busy}
              />
            </Field>
          )}
          {error && <p role="alert">{error}</p>}
          <Button
            type="submit"
            variant="danger"
            disabled={busy || (admin && !reason.trim())}
          >
            {busy ? "正在撤回…" : "确认撤回"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
