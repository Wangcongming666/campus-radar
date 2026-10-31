-- 取消评论审核后的历史数据过渡。仅在明确授权公开历史待审评论后执行。
-- 本机已于2026-10-31执行（1条），不必重复。先加载直接发布的新后端，避免旧进程继续产生PENDING。
-- 幂等：只更新PENDING；保留HIDDEN/已撤回/已删除正文和状态。系统审计actor_id=NULL，不冒用管理员身份。
START TRANSACTION;
SELECT id FROM comments WHERE status='PENDING' FOR UPDATE;
INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,reason,request_id,change_summary)
SELECT UUID(),NULL,'COMMENT_POLICY_PUBLISH',
       CASE WHEN post_id IS NOT NULL THEN 'POST_COMMENT' ELSE 'EXPERIENCE_COMMENT' END,
       id,'经用户授权，取消评论审核并公开历史待审评论。',UUID(),
       JSON_OBJECT('from','PENDING','to','PUBLISHED','authorization','explicit-policy-change')
FROM comments WHERE status='PENDING';
UPDATE comments SET status='PUBLISHED',version=version+1,updated_at=CURRENT_TIMESTAMP(3)
WHERE status='PENDING';
COMMIT;
