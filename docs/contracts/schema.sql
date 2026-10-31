-- 校招雷达 MySQL 8.4 完整建表 SQL，共49张业务表。
-- 仅新建空库时手动执行一次；已有数据库不要重复执行。
-- 后端启动只连接现有数据库，不自动创建或更新表。
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(40) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'USER' COMMENT 'USER / REVIEWER / ADMIN',
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE / FROZEN / DELETING / DISABLED；PENDING仅兼容旧记录',
  auth_version INT NOT NULL DEFAULT 1,
  avatar_file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  data_revision INT NOT NULL DEFAULT 0,
  board_version INT NOT NULL DEFAULT 1 COMMENT 'API boardVersion；仅看板结构变化递增',
  data_operation VARCHAR(16) NOT NULL DEFAULT 'IDLE' COMMENT 'IDLE / IMPORTING / RESETTING',
  school VARCHAR(100) NULL,
  education VARCHAR(32) NULL,
  graduation_year SMALLINT NULL,
  preferences JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  theme VARCHAR(32) NOT NULL DEFAULT 'DARK' COMMENT 'DARK / LIGHT / SYSTEM',
  timezone VARCHAR(64) NOT NULL,
  onboarding_step INT NOT NULL DEFAULT 0,
  buddy_discoverable TINYINT(1) NOT NULL DEFAULT 0,
  provider_verified TINYINT(1) NOT NULL DEFAULT 0,
  provider_verified_until DATETIME(3) NULL COMMENT 'UTC',
  email_verified_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT ck_users_1 CHECK (onboarding_step BETWEEN 0 AND 4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='身份与资料';

CREATE TABLE companies (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  slug VARCHAR(80) NOT NULL,
  name VARCHAR(120) NOT NULL,
  logo_url VARCHAR(2000) NULL,
  industry VARCHAR(80) NULL,
  size_band VARCHAR(40) NULL,
  cities JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  tags JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  description_md MEDIUMTEXT NOT NULL,
  verified_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_slug (slug),
  KEY idx_company_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公司公开资料';

CREATE TABLE sources (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  name VARCHAR(120) NOT NULL,
  base_url VARCHAR(2000) NOT NULL,
  content_mode VARCHAR(32) NOT NULL COMMENT 'METADATA_LINK / AUTHORIZED_FULL / ORIGINAL',
  permission_note VARCHAR(2000) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  verified_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='人工内容来源登记';

CREATE TABLE chapters (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  slug VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  direction VARCHAR(40) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  body_md MEDIUMTEXT NOT NULL,
  content_version INT NOT NULL DEFAULT 1,
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_chapter_slug (slug),
  KEY idx_chapter_tree (direction,parent_id,sort_order),
  FOREIGN KEY (parent_id) REFERENCES chapters (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='求职宝典章节';

CREATE TABLE outbox_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  event_type VARCHAR(64) NOT NULL,
  aggregate_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  routing_key VARCHAR(100) NOT NULL,
  payload JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  state VARCHAR(16) NOT NULL,
  attempt INT NOT NULL DEFAULT 0,
  available_at DATETIME(3) NOT NULL COMMENT 'UTC',
  lease_token VARCHAR(64) NULL,
  lease_until DATETIME(3) NULL COMMENT 'UTC',
  published_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_outbox_due (state,available_at,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='业务事务内登记事件';

CREATE TABLE consumer_inbox (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  consumer VARCHAR(80) NOT NULL,
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  state VARCHAR(16) NOT NULL,
  lease_token VARCHAR(64) NULL,
  lease_until DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_inbox_event (consumer,event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='每处理器每事件的幂等和租约';

CREATE TABLE auth_tokens (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  purpose VARCHAR(32) NOT NULL COMMENT 'RESET_PASSWORD；VERIFY_EMAIL仅历史记录',
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL COMMENT 'UTC',
  consumed_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_auth_tokens_owner (user_id,id),
  UNIQUE KEY uq_auth_token_hash (token_hash),
  KEY idx_auth_expire (expires_at),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮箱验证和密码重置令牌';

CREATE TABLE jobs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  source_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  title VARCHAR(200) NOT NULL,
  role VARCHAR(40) NOT NULL,
  education VARCHAR(32) NOT NULL,
  recruitment_type VARCHAR(32) NOT NULL COMMENT 'CAMPUS / INTERNSHIP',
  skills JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  description_md MEDIUMTEXT NOT NULL,
  search_text TEXT NOT NULL,
  canonical_url VARCHAR(2000) NOT NULL,
  canonical_url_hash VARCHAR(64) NOT NULL,
  salary JSON NULL COMMENT 'DTO校验后写入，非任意实体集合',
  deadline_at DATETIME(3) NULL COMMENT 'UTC',
  deadline_date DATE NULL,
  deadline_precision VARCHAR(32) NOT NULL COMMENT 'EXACT / DATE / UNKNOWN',
  source_timezone VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL COMMENT 'OPEN / CLOSED / UNKNOWN',
  publication_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / PENDING / PUBLISHED / REJECTED / HIDDEN',
  published_at DATETIME(3) NULL COMMENT 'UTC',
  collected_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_job_source_url (source_id,canonical_url_hash),
  KEY idx_job_publish (publication_status,status,published_at,id),
  KEY idx_job_deadline (publication_status,deadline_at,id),
  KEY idx_job_company (company_id,publication_status),
  FULLTEXT KEY ft_job_text (title,search_text) WITH PARSER ngram,
  FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
  FOREIGN KEY (source_id) REFERENCES sources (id) ON DELETE RESTRICT,
  CONSTRAINT ck_jobs_1 CHECK ((deadline_precision = 'UNKNOWN' AND deadline_at IS NULL AND deadline_date IS NULL) OR (deadline_precision = 'DATE' AND deadline_date IS NOT NULL AND deadline_at IS NULL) OR (deadline_precision = 'EXACT' AND deadline_at IS NOT NULL AND deadline_date IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公开岗位';

CREATE TABLE files (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  purpose VARCHAR(32) NOT NULL COMMENT 'RESUME / RECORDING / AVATAR / BACKUP',
  original_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'READY' COMMENT 'READY / PENDING_DELETE',
  expires_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_files_owner (user_id,id),
  UNIQUE KEY uq_file_storage (storage_key),
  KEY idx_file_owner (user_id,created_at),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT ck_files_1 CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='私有附件元数据';

CREATE TABLE experiences (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  title VARCHAR(200) NOT NULL,
  summary VARCHAR(1000) NOT NULL,
  body_md MEDIUMTEXT NOT NULL,
  role VARCHAR(40) NOT NULL,
  round_type VARCHAR(40) NOT NULL,
  occurred_on DATE NULL,
  tags JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  content_mode VARCHAR(32) NOT NULL COMMENT 'ORIGINAL / AUTHORIZED_FULL / EXCERPT_LINK',
  source_url VARCHAR(2000) NULL,
  license_note VARCHAR(1000) NOT NULL,
  status VARCHAR(32) NOT NULL,
  published_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_experience_list (status,company_id,published_at,id),
  FULLTEXT KEY ft_experience (title,body_md) WITH PARSER ngram,
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='面经与审核状态';

CREATE TABLE questions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  title VARCHAR(200) NOT NULL,
  chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  prompt_md MEDIUMTEXT NOT NULL,
  answer_md MEDIUMTEXT NOT NULL,
  role VARCHAR(40) NOT NULL,
  difficulty VARCHAR(16) NOT NULL,
  tags JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_question_filter (status,role,difficulty,id),
  FULLTEXT KEY ft_question (title,prompt_md) WITH PARSER ngram,
  FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公共题库';

CREATE TABLE chapter_progress (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  chapter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  completed TINYINT(1) NOT NULL DEFAULT 0,
  note MEDIUMTEXT NOT NULL,
  chapter_version INT NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_chapter_progress_owner (user_id,id),
  UNIQUE KEY uq_chapter_progress (user_id,chapter_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (chapter_id) REFERENCES chapters (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='本人笔记和学习进度';

CREATE TABLE favorites (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  target_type VARCHAR(32) NOT NULL,
  target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_favorites_owner (user_id,id),
  UNIQUE KEY uq_favorite (user_id,target_type,target_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='收藏；目标为类型化逻辑外键';

CREATE TABLE mock_sessions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  role VARCHAR(40) NOT NULL,
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  duration_seconds INT NOT NULL DEFAULT 0,
  remaining_seconds INT NOT NULL DEFAULT 0,
  state VARCHAR(32) NOT NULL,
  timer_started_at DATETIME(3) NULL COMMENT 'UTC',
  report JSON NULL COMMENT 'DTO校验后写入，非任意实体集合',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mock_sessions_owner (user_id,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='题库练习计时';

CREATE TABLE plan_tasks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  title VARCHAR(200) NOT NULL,
  status VARCHAR(16) NOT NULL,
  due_at DATETIME(3) NULL COMMENT 'UTC',
  notes TEXT NOT NULL,
  milestone VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  generation_key VARCHAR(100) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_tasks_owner (user_id,id),
  UNIQUE KEY uq_plan_generation (user_id,generation_key),
  KEY idx_plan_due (user_id,status,due_at),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='个人任务及里程碑';

CREATE TABLE offer_comparisons (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  offer_ids JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  weights JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_offer_comparisons_owner (user_id,id),
  UNIQUE KEY uq_offer_comparison (user_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='本人唯一比较配置';

CREATE TABLE salary_reports (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  role VARCHAR(40) NOT NULL,
  city VARCHAR(64) NOT NULL,
  year INT NOT NULL DEFAULT 0,
  base_monthly_minor BIGINT NULL COMMENT '整数分；API上限10^12，未知为NULL',
  salary_months DECIMAL(4,2) NULL,
  bonus_minor BIGINT NULL COMMENT '整数分；API上限10^12，未知为NULL',
  source_note VARCHAR(1000) NOT NULL,
  verification VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_salary_group (status,company_id,role,city,year),
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='匿名展示的薪资样本';

CREATE TABLE subscriptions (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  name VARCHAR(80) NOT NULL,
  conditions JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  in_app TINYINT(1) NOT NULL DEFAULT 1,
  email_enabled TINYINT(1) NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_scanned_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscriptions_owner (user_id,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='岗位订阅配置';

CREATE TABLE notifications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  type VARCHAR(32) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  target_path VARCHAR(500) NULL,
  read_at DATETIME(3) NULL COMMENT 'UTC',
  dedup_key VARCHAR(190) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_notifications_owner (user_id,id),
  UNIQUE KEY uq_notification_dedup (user_id,dedup_key),
  KEY idx_notification_unread (user_id,read_at,created_at,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='站内通知';

CREATE TABLE mail_deliveries (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  recipient VARCHAR(254) NOT NULL,
  template VARCHAR(64) NOT NULL,
  encrypted_payload MEDIUMTEXT NOT NULL,
  dedup_key VARCHAR(190) NOT NULL,
  state VARCHAR(32) NOT NULL,
  attempt INT NOT NULL DEFAULT 0,
  provider_message_id VARCHAR(255) NULL,
  expires_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mail_dedup (dedup_key),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邮件投递，外部发送无法保证恰好一次';

CREATE TABLE posts (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  body_md TEXT NOT NULL,
  tags JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  status VARCHAR(32) NOT NULL,
  published_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_post_feed (status,published_at,id),
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='公开社区动态';

CREATE TABLE buddy_rooms (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  owner_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  visibility VARCHAR(16) NOT NULL,
  capacity INT NOT NULL DEFAULT 6,
  state VARCHAR(16) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  FOREIGN KEY (owner_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT ck_buddy_rooms_1 CHECK (capacity BETWEEN 2 AND 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='组队房间';

CREATE TABLE radar_signals (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  kind VARCHAR(32) NOT NULL,
  source_url VARCHAR(2000) NOT NULL,
  occurred_at DATETIME(3) NOT NULL COMMENT 'UTC',
  verified_at DATETIME(3) NULL COMMENT 'UTC',
  confidence VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_signal_list (status,occurred_at,company_id,id),
  FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='有时间与来源的公司信号';

CREATE TABLE content_reports (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  target_type VARCHAR(32) NOT NULL,
  target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  reason VARCHAR(1000) NOT NULL,
  state VARCHAR(16) NOT NULL,
  reviewer_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  decision_note VARCHAR(1000) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_reports_owner (user_id,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='内容举报与处置';

CREATE TABLE audit_logs (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  actor_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  reason VARCHAR(1000) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  change_summary JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_target (target_type,target_id,created_at),
  FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='追加式管理审计';

CREATE TABLE idempotency_records (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  method VARCHAR(8) NOT NULL,
  route_hash VARCHAR(64) NOT NULL,
  idem_key VARCHAR(80) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  http_status INT NOT NULL DEFAULT 0,
  response_body JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  expires_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_idempotency_records_owner (user_id,id),
  UNIQUE KEY uq_http_idempotency (user_id,method,route_hash,idem_key),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HTTP写入重放';

CREATE TABLE job_cities (
  job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  city VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (job_id,city),
  KEY idx_city_job (city,job_id),
  FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='岗位多地点关系';

CREATE TABLE job_graduation_years (
  job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  graduation_year INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (job_id,graduation_year),
  KEY idx_year_job (graduation_year,job_id),
  FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='岗位届别关系';

CREATE TABLE resumes (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  name VARCHAR(120) NOT NULL,
  sequence INT NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  default_owner CHAR(36) CHARACTER SET ascii COLLATE ascii_bin GENERATED ALWAYS AS (CASE WHEN is_default = 1 THEN user_id ELSE NULL END) STORED,
  text_content MEDIUMTEXT NOT NULL,
  extraction_state VARCHAR(32) NOT NULL COMMENT 'TEXT_READY / NO_TEXT / FAILED',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_resumes_owner (user_id,id),
  UNIQUE KEY uq_resume_sequence (user_id,sequence),
  UNIQUE KEY uq_resume_default (default_owner),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,file_id) REFERENCES files (user_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='简历版本';

CREATE TABLE question_companies (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  question_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  evidence_note VARCHAR(1000) NOT NULL,
  observed_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_question_company (question_id,company_id),
  FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='题目与公司样本关系';

CREATE TABLE question_progress (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  question_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  mastery VARCHAR(16) NOT NULL,
  is_wrong TINYINT(1) NOT NULL DEFAULT 0,
  note TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_question_progress_owner (user_id,id),
  UNIQUE KEY uq_question_progress (user_id,question_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='本人掌握度与错题';

CREATE TABLE mock_answers (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  session_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  question_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  sequence INT NOT NULL DEFAULT 1,
  prompt_snapshot MEDIUMTEXT NOT NULL,
  reference_snapshot MEDIUMTEXT NOT NULL,
  answer_text MEDIUMTEXT NOT NULL,
  self_score DECIMAL(5,2) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_mock_answers_owner (user_id,id),
  UNIQUE KEY uq_mock_sequence (session_id,sequence),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,session_id) REFERENCES mock_sessions (user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='题目和答案快照';

CREATE TABLE subscription_hits (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  subscription_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  job_version INT NOT NULL DEFAULT 1,
  notification_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_subscription_hits_owner (user_id,id),
  UNIQUE KEY uq_subscription_hit (subscription_id,job_id,job_version),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,subscription_id) REFERENCES subscriptions (user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,notification_id) REFERENCES notifications (user_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='岗位版本命中去重';

CREATE TABLE referrals (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  provider_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  company_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL COMMENT 'UTC',
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_referral_list (status,expires_at,id),
  FOREIGN KEY (provider_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
  FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='已认证提供者的内推';

CREATE TABLE comments (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  experience_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '面经主题；与post_id恰有一个非NULL',
  post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '社区主题；与experience_id恰有一个非NULL',
  author_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  parent_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT '同主题父评论；创建后不可改',
  body TEXT NOT NULL,
  status VARCHAR(32) NOT NULL COMMENT 'PUBLISHED直接发布 / HIDDEN撤回、删除或下架；PENDING仅历史兼容',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_comment_experience_id (experience_id,id),
  UNIQUE KEY uq_comment_post_id (post_id,id),
  KEY idx_comment_experience_list (experience_id,status,created_at,id),
  KEY idx_comment_post_list (post_id,status,created_at,id),
  -- CHECK所涉外键列不配置级联动作；省略ON DELETE/UPDATE，使用InnoDB默认RESTRICT。
  FOREIGN KEY (experience_id) REFERENCES experiences (id),
  FOREIGN KEY (post_id) REFERENCES posts (id),
  FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (experience_id,parent_id) REFERENCES comments (experience_id,id),
  FOREIGN KEY (post_id,parent_id) REFERENCES comments (post_id,id),
  CONSTRAINT ck_comment_topic CHECK ((experience_id IS NOT NULL AND post_id IS NULL) OR (experience_id IS NULL AND post_id IS NOT NULL)),
  CONSTRAINT ck_comment_not_self CHECK (parent_id IS NULL OR parent_id <> id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='面经与社区共用评论及审核';

CREATE TABLE post_likes (
  post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (post_id,user_id),
  FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='点赞关系';

CREATE TABLE buddy_members (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  role VARCHAR(16) NOT NULL,
  joined_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_buddy_member (room_id,user_id),
  FOREIGN KEY (room_id) REFERENCES buddy_rooms (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='房间成员';

CREATE TABLE buddy_invitations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  inviter_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  invitee_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  state VARCHAR(16) NOT NULL,
  expires_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_buddy_invitee (invitee_id,state,expires_at),
  FOREIGN KEY (room_id) REFERENCES buddy_rooms (id) ON DELETE RESTRICT,
  FOREIGN KEY (inviter_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (invitee_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='邀请状态与到期';

CREATE TABLE buddy_tasks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  title VARCHAR(200) NOT NULL,
  question_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  due_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_buddy_task_room (room_id,id),
  FOREIGN KEY (room_id) REFERENCES buddy_rooms (id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES questions (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='房间共享题目任务';

CREATE TABLE tasks (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  type VARCHAR(32) NOT NULL,
  state VARCHAR(16) NOT NULL,
  payload JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  result_file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  progress INT NOT NULL DEFAULT 0,
  attempt INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  dedup_key VARCHAR(190) NOT NULL,
  next_attempt_at DATETIME(3) NOT NULL COMMENT 'UTC',
  lease_token VARCHAR(64) NULL,
  lease_until DATETIME(3) NULL COMMENT 'UTC',
  error_code VARCHAR(64) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_task_dedup (dedup_key),
  KEY idx_task_due (state,next_attempt_at,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (result_file_id) REFERENCES files (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='后台任务状态和租约';

CREATE TABLE import_previews (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  backup_file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  data_revision INT NOT NULL DEFAULT 0,
  state VARCHAR(16) NOT NULL,
  manifest JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  expires_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_import_previews_owner (user_id,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,backup_file_id) REFERENCES files (user_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='备份恢复校验快照';

CREATE TABLE applications (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  job_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  resume_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  stage VARCHAR(32) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING / APPLIED / ASSESSMENT / INTERVIEW_1 / INTERVIEW_2 / HR / OFFER / CLOSED',
  sort_key DECIMAL(30,10) NOT NULL,
  notes MEDIUMTEXT NOT NULL,
  applied_at DATETIME(3) NULL COMMENT 'UTC',
  closed_reason VARCHAR(32) NULL,
  closed_at DATETIME(3) NULL COMMENT 'UTC',
  archived_at DATETIME(3) NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_applications_owner (user_id,id),
  UNIQUE KEY uq_application_job (user_id,job_id),
  KEY idx_board_order (user_id,archived_at,stage,sort_key,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,resume_id) REFERENCES resumes (user_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_applications_1 CHECK ((stage = 'CLOSED' AND closed_reason IS NOT NULL AND closed_at IS NOT NULL) OR (stage <> 'CLOSED' AND closed_reason IS NULL AND closed_at IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='投递与归档';

CREATE TABLE referral_requests (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  referral_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  applicant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  message TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  reply TEXT NOT NULL,
  consent_at DATETIME(3) NOT NULL COMMENT 'UTC',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_referral_applicant (referral_id,applicant_id),
  KEY idx_request_applicant (applicant_id,status),
  FOREIGN KEY (referral_id) REFERENCES referrals (id) ON DELETE RESTRICT,
  FOREIGN KEY (applicant_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='仅申请双方可读';

CREATE TABLE buddy_task_progress (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  room_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  task_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  completed TINYINT(1) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_buddy_task_user (task_id,user_id),
  FOREIGN KEY (room_id,user_id) REFERENCES buddy_members (room_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_id,task_id) REFERENCES buddy_tasks (room_id,id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='成员自己的任务完成状态';

CREATE TABLE application_stage_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  operation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  from_stage VARCHAR(32) NULL,
  to_stage VARCHAR(32) NOT NULL,
  result_board_version INT NOT NULL DEFAULT 1,
  old_closed_reason VARCHAR(32) NULL,
  old_closed_at DATETIME(3) NULL,
  old_applied_at DATETIME(3) NULL,
  old_sort_key DECIMAL(30,10) NULL,
  new_sort_key DECIMAL(30,10) NOT NULL,
  old_before_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  old_after_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  result_version INT NOT NULL DEFAULT 1,
  occurred_at DATETIME(3) NOT NULL COMMENT 'UTC',
  undone TINYINT(1) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_application_stage_events_owner (user_id,id),
  UNIQUE KEY uq_stage_operation (operation_id),
  KEY idx_stage_history (application_id,occurred_at,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,application_id) REFERENCES applications (user_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='不可变投递事件';

CREATE TABLE interview_rounds (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  title VARCHAR(120) NOT NULL,
  round_type VARCHAR(32) NOT NULL,
  sequence INT NOT NULL DEFAULT 1,
  mode VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL,
  starts_at DATETIME(3) NULL COMMENT 'UTC',
  ends_at DATETIME(3) NULL COMMENT 'UTC',
  timezone VARCHAR(64) NOT NULL,
  location VARCHAR(500) NULL,
  meeting_url VARCHAR(2000) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_interview_rounds_owner (user_id,id),
  UNIQUE KEY uq_round_sequence (application_id,sequence),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,application_id) REFERENCES applications (user_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_interview_rounds_1 CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at > starts_at))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='面试轮次';

CREATE TABLE offers (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  company_name VARCHAR(120) NOT NULL,
  title VARCHAR(200) NOT NULL,
  city VARCHAR(64) NOT NULL,
  base_monthly_minor BIGINT NULL COMMENT '整数分；API上限10^12，未知为NULL',
  salary_months DECIMAL(4,2) NULL,
  bonus_minor BIGINT NULL COMMENT '整数分；API上限10^12，未知为NULL',
  equity_note TEXT NOT NULL,
  benefits TEXT NOT NULL,
  expires_at DATETIME(3) NULL COMMENT 'UTC',
  status VARCHAR(16) NOT NULL,
  scores JSON NOT NULL COMMENT 'DTO校验后写入，非任意实体集合',
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_offers_owner (user_id,id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,application_id) REFERENCES applications (user_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='本人Offer';

CREATE TABLE calendar_events (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  application_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  round_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  title VARCHAR(120) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  starts_at DATETIME(3) NOT NULL COMMENT 'UTC',
  ends_at DATETIME(3) NOT NULL COMMENT 'UTC',
  timezone VARCHAR(64) NOT NULL,
  location VARCHAR(500) NULL,
  meeting_url VARCHAR(2000) NULL,
  notes TEXT NOT NULL,
  status VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_calendar_events_owner (user_id,id),
  UNIQUE KEY uq_calendar_round (round_id),
  KEY idx_calendar_owner_time (user_id,starts_at,ends_at),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,application_id) REFERENCES applications (user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,round_id) REFERENCES interview_rounds (user_id,id) ON DELETE RESTRICT,
  CONSTRAINT ck_calendar_events_1 CHECK (ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='日程；轮次日程同步投影';

CREATE TABLE interview_reviews (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  round_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL COMMENT 'UUID字符串',
  recording_file_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL COMMENT 'UUID字符串',
  transcript MEDIUMTEXT NOT NULL,
  notes MEDIUMTEXT NOT NULL,
  self_score DECIMAL(5,2) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_interview_reviews_owner (user_id,id),
  UNIQUE KEY uq_review_round (round_id),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,round_id) REFERENCES interview_rounds (user_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id,recording_file_id) REFERENCES files (user_id,id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='本人轮次复盘';

ALTER TABLE users ADD CONSTRAINT fk_user_avatar FOREIGN KEY (id,avatar_file_id) REFERENCES files (user_id,id);
