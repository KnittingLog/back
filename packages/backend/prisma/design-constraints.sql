-- 초기 설계의 보완 SQL입니다. 승인된 마이그레이션이 아니며 자동으로 실행하지 않습니다.
-- Prisma가 생성한 초기 테이블 SQL 뒤에 검토하여 포함합니다. 기존 DB의 변환에는 사용하지 않습니다.
-- CHECK와 부분 고유 인덱스의 기준은 이 파일입니다. 물리 FK는 생성하지 않습니다.

ALTER TABLE projects.project_workspaces
  ADD CONSTRAINT ck_project_workspaces_done_time
  CHECK ((status = 'done') = (ended_at IS NOT NULL)),
  ADD CONSTRAINT ck_project_workspaces_version
  CHECK (version >= 0);

ALTER TABLE projects.project_counters
  ADD CONSTRAINT ck_project_counters_value
  CHECK (value >= 0 AND (target_value IS NULL OR target_value >= 0)),
  ADD CONSTRAINT ck_project_counters_version_order
  CHECK (version >= 0 AND sort_order >= 0);

ALTER TABLE accounts.users
  ADD CONSTRAINT ck_users_auth_version
  CHECK (auth_version >= 0),
  ADD CONSTRAINT ck_users_erasure
  CHECK (deleted_at IS NULL OR (password_hash IS NULL AND handle IS NULL AND nickname IS NULL AND biography IS NULL AND profile_photo_object_id IS NULL)),
  ADD CONSTRAINT ck_users_active_secrets
  CHECK (deleted_at IS NOT NULL OR (password_hash IS NOT NULL AND handle IS NOT NULL AND nickname IS NOT NULL));

ALTER TABLE accounts.user_identifiers
  ADD CONSTRAINT ck_user_identifiers_format
  CHECK (value ~ '^[a-z0-9][a-z0-9_.]{1,30}[a-z0-9]$' AND value NOT LIKE '%..%');

ALTER TABLE accounts.command_receipts
  ADD CONSTRAINT ck_command_receipts_request_hash
  CHECK (request_hash ~ '^[0-9a-f]{64}$');

ALTER TABLE accounts.policy_documents
  ADD CONSTRAINT ck_policy_documents_language
  CHECK (language = 'ko');

ALTER TABLE projects.project_timers
  ADD CONSTRAINT ck_project_timers_duration_version
  CHECK (accumulated_seconds >= 0 AND version >= 0),
  ADD CONSTRAINT ck_project_timers_running_time
  CHECK ((status = 'running') = (started_at IS NOT NULL)),
  ADD CONSTRAINT ck_project_timers_stop_result
  CHECK ((status = 'stopped') = (stopped_at IS NOT NULL AND record_id IS NOT NULL)),
  ADD CONSTRAINT ck_project_timers_unfinished_result
  CHECK (status = 'stopped' OR (stopped_at IS NULL AND record_id IS NULL));

ALTER TABLE projects.project_records
  ADD CONSTRAINT ck_project_records_duration
  CHECK (duration_seconds >= 0);

ALTER TABLE social.friendships
  ADD CONSTRAINT ck_friendships_order
  CHECK (user_low_id < user_high_id);

ALTER TABLE social.friend_requests
  ADD CONSTRAINT ck_friend_requests_distinct_users
  CHECK (sender_id <> recipient_id);

ALTER TABLE social.user_blocks
  ADD CONSTRAINT ck_user_blocks_distinct_users
  CHECK (blocker_id <> blocked_id);

ALTER TABLE projects.project_invitations
  ADD CONSTRAINT ck_project_invitations_distinct_users
  CHECK (sender_id <> recipient_id);

ALTER TABLE community.reports
  ADD CONSTRAINT ck_reports_one_target
  CHECK ((target_user_id IS NOT NULL) <> (post_id IS NOT NULL)),
  ADD CONSTRAINT ck_reports_other_detail
  CHECK (reason_code <> 'other' OR (detail IS NOT NULL AND length(btrim(detail)) > 0)),
  ADD CONSTRAINT ck_reports_closed_time
  CHECK ((status = 'closed') = (closed_at IS NOT NULL));

ALTER TABLE projects.workspace_transfers
  ADD CONSTRAINT ck_workspace_transfers_distinct_projects
  CHECK (from_project_id <> to_project_id),
  ADD CONSTRAINT ck_workspace_transfers_distinct_memberships
  CHECK (from_membership_id <> to_membership_id),
  ADD CONSTRAINT ck_workspace_transfers_version
  CHECK (workspace_version > 0);

ALTER TABLE accounts.stored_objects
  ADD CONSTRAINT ck_stored_objects_integrity
  CHECK (byte_size >= 0 AND sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT ck_stored_objects_purge_state
  CHECK (purged_at IS NULL OR deleted_at IS NOT NULL);

-- 직접 삭제한 행만 작업 식별자를 갖습니다. 부모 삭제는 자식 행을 변경하지 않습니다.
ALTER TABLE projects.projects
  ADD CONSTRAINT ck_projects_deletion_operation
  CHECK ((deleted_at IS NULL) = (deletion_operation_id IS NULL));
ALTER TABLE projects.project_workspaces
  ADD CONSTRAINT ck_project_workspaces_deletion_operation
  CHECK ((deleted_at IS NULL) = (deletion_operation_id IS NULL));
ALTER TABLE projects.project_counters
  ADD CONSTRAINT ck_project_counters_deletion_operation
  CHECK ((deleted_at IS NULL) = (deletion_operation_id IS NULL));
ALTER TABLE projects.project_records
  ADD CONSTRAINT ck_project_records_deletion_operation
  CHECK ((deleted_at IS NULL) = (deletion_operation_id IS NULL));
ALTER TABLE projects.record_comments
  ADD CONSTRAINT ck_record_comments_deletion_operation
  CHECK ((deleted_at IS NULL) = (deletion_operation_id IS NULL));
ALTER TABLE community.posts
  ADD CONSTRAINT ck_posts_deletion_operation
  CHECK ((deleted_at IS NULL) = (deletion_operation_id IS NULL));
ALTER TABLE community.post_comments
  ADD CONSTRAINT ck_post_comments_deletion_operation
  CHECK ((deleted_at IS NULL) = (deletion_operation_id IS NULL));

-- 종료한 참여와 처리한 요청은 이력으로 남깁니다. 유효한 관계만 제한합니다.
CREATE UNIQUE INDEX ux_project_memberships_current
  ON projects.project_memberships (project_id, user_id)
  WHERE left_at IS NULL AND deleted_at IS NULL;

-- 반대 방향의 대기 요청도 같은 사용자 쌍으로 취급합니다.
CREATE UNIQUE INDEX ux_friend_requests_pending_pair
  ON social.friend_requests (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id))
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE UNIQUE INDEX ux_project_invitations_pending
  ON projects.project_invitations (project_id, recipient_id)
  WHERE status = 'pending' AND deleted_at IS NULL;

-- 일시정지도 이어할 타이머로 취급합니다. 작업 공간 이관은 이 조건을 바꾸지 않습니다.
CREATE UNIQUE INDEX ux_project_timers_current
  ON projects.project_timers (workspace_id)
  WHERE status IN ('running', 'paused') AND deleted_at IS NULL;
