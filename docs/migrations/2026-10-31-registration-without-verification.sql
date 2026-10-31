-- 用户明确要求取消邮箱验证；只启用历史PENDING普通账号。
-- 不修改FROZEN/DISABLED/DELETING或管理账号，不伪造email_verified_at。
-- 业务表结构不变；新注册由服务显式写入ACTIVE。可重复执行。
START TRANSACTION;
SELECT id FROM users WHERE status='PENDING' AND role='USER' FOR UPDATE;
INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,reason,request_id,change_summary)
SELECT UUID(),NULL,'ACCOUNT_REGISTRATION_POLICY','USER',id,
       '经用户授权取消邮箱验证，启用历史待验证普通账号。',UUID(),
       JSON_OBJECT('from','PENDING','to','ACTIVE','authorization','explicit-policy-change')
FROM users WHERE status='PENDING' AND role='USER';
UPDATE users SET status='ACTIVE',auth_version=auth_version+1,version=version+1,updated_at=CURRENT_TIMESTAMP(3)
WHERE status='PENDING' AND role='USER';
UPDATE auth_tokens t JOIN users u ON u.id=t.user_id
SET t.consumed_at=CURRENT_TIMESTAMP(3),t.version=t.version+1
WHERE u.role='USER' AND u.status='ACTIVE' AND t.purpose='VERIFY_EMAIL' AND t.consumed_at IS NULL;
COMMIT;
