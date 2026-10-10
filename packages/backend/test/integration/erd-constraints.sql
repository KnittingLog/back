\set ON_ERROR_STOP on
\if :{?expected_data_directory}
\else
  DO $$ BEGIN RAISE EXCEPTION '검사할 일회용 클러스터 경로가 필요합니다'; END $$;
\endif
\if :{?expected_port}
\else
  \set expected_port 50799
\endif
\getenv allow_writes KNITTINGLOG_TEST_ALLOW_WRITES
\if :{?allow_writes}
\else
  DO $$ BEGIN RAISE EXCEPTION '격리 DB 쓰기 승인이 필요합니다'; END $$;
\endif
BEGIN;
SELECT set_config('knittinglog_test.expected_data_directory', :'expected_data_directory', true);
SELECT set_config('knittinglog_test.allow_writes', :'allow_writes', true);
SELECT set_config('knittinglog_test.expected_port', :'expected_port', true);

-- 승인한 일회용 로컬 클러스터만 검사합니다. 다른 대상에서는 쓰기 전에 중단합니다.
DO $$
BEGIN
  IF current_database() <> 'knittinglog_tdd'
    OR current_setting('knittinglog_test.allow_writes') <> '1'
    OR current_setting('data_directory') <> current_setting('knittinglog_test.expected_data_directory')
    OR current_setting('data_directory') !~ '^/private/tmp/knittinglog-tdd\.[^/]+/postgres$'
    OR current_setting('knittinglog_test.expected_port') NOT IN ('50799', '50801')
    OR inet_server_port()::text IS DISTINCT FROM current_setting('knittinglog_test.expected_port')
    OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  THEN RAISE EXCEPTION '일회용 검증 클러스터가 아닙니다'; END IF;
  IF (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'f' AND n.nspname IN ('accounts', 'social', 'projects', 'community')) <> 0
  THEN RAISE EXCEPTION '물리 FK가 있습니다'; END IF;
  IF (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE c.contype = 'c' AND n.nspname IN ('accounts', 'social', 'projects', 'community')) <> 34
  THEN RAISE EXCEPTION 'CHECK 개수가 다릅니다'; END IF;
END $$;

CREATE TEMP TABLE fixtures (model text PRIMARY KEY, id uuid NOT NULL);
INSERT INTO fixtures SELECT name, gen_random_uuid() FROM unnest(ARRAY[
  'users', 'user_identifiers', 'policy_documents', 'command_receipts', 'stored_objects',
  'friend_requests', 'friendships', 'user_blocks', 'projects', 'project_memberships',
  'project_invitations', 'project_workspaces', 'project_counters', 'project_records',
  'project_timers', 'workspace_transfers', 'record_comments', 'posts', 'post_comments', 'reports'
]) AS name;

-- 행 내부 제약만 검사합니다. 아래 가짜 참조는 업무 관계 검증의 증거가 아닙니다.
DO $$
DECLARE r record; actor uuid := gen_random_uuid();
BEGIN
  FOR r IN SELECT * FROM fixtures LOOP
    CASE r.model
      WHEN 'users' THEN
        INSERT INTO accounts.users(id, login_id, handle, nickname, password_hash, created_by, updated_by)
          VALUES(r.id, 'qa_' || substr(replace(r.id::text, '-', ''),1,24), 'qa_' || substr(replace(r.id::text, '-', ''),1,24), '검증 사용자', '검증 해시', actor, actor);
      WHEN 'user_identifiers' THEN
        INSERT INTO accounts.user_identifiers(id,user_id,kind,value,created_by,updated_by)
          VALUES(r.id,actor,'handle','qa_' || substr(replace(r.id::text, '-', ''),1,24),actor,actor);
      WHEN 'policy_documents' THEN
        INSERT INTO accounts.policy_documents(id,code,version,title,body,effective_at,created_by,updated_by)
          VALUES(r.id,'qa_' || r.id::text,'1','검증 정책','검증 본문',now(),actor,actor);
      WHEN 'command_receipts' THEN
        INSERT INTO accounts.command_receipts(id,actor_user_id,command_type,request_hash,result,created_by,updated_by)
          VALUES(r.id,actor,'qa_constraint',repeat('a',64),'{}',actor,actor);
      WHEN 'stored_objects' THEN
        INSERT INTO accounts.stored_objects(id,owner_user_id,storage_code,object_key,sha256,byte_size,created_by,updated_by)
          VALUES(r.id,actor,'qa_constraint',r.id::text,repeat('a',64),0,actor,actor);
      WHEN 'friend_requests' THEN
        INSERT INTO social.friend_requests(id,sender_id,recipient_id,created_by,updated_by)
          VALUES(r.id,actor,gen_random_uuid(),actor,actor);
      WHEN 'friendships' THEN
        INSERT INTO social.friendships(id,user_low_id,user_high_id,created_by,updated_by)
          VALUES(r.id,'10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000000',actor,actor);
      WHEN 'user_blocks' THEN
        INSERT INTO social.user_blocks(id,blocker_id,blocked_id,created_by,updated_by)
          VALUES(r.id,actor,gen_random_uuid(),actor,actor);
      WHEN 'projects' THEN
        INSERT INTO projects.projects(id,owner_user_id,name,created_by,updated_by)
          VALUES(r.id,actor,'검증 프로젝트',actor,actor);
      WHEN 'project_memberships' THEN
        INSERT INTO projects.project_memberships(id,project_id,user_id,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),actor,actor,actor);
      WHEN 'project_invitations' THEN
        INSERT INTO projects.project_invitations(id,project_id,sender_id,recipient_id,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),actor,gen_random_uuid(),actor,actor);
      WHEN 'project_workspaces' THEN
        INSERT INTO projects.project_workspaces(id,project_id,owner_user_id,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),actor,actor,actor);
      WHEN 'project_counters' THEN
        INSERT INTO projects.project_counters(id,workspace_id,name,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),'검증 카운터',actor,actor);
      WHEN 'project_records' THEN
        INSERT INTO projects.project_records(id,workspace_id,author_id,source,duration_seconds,recorded_at,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),actor,'manual',0,now(),actor,actor);
      WHEN 'project_timers' THEN
        INSERT INTO projects.project_timers(id,workspace_id,owner_user_id,started_at,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),actor,now(),actor,actor);
      WHEN 'workspace_transfers' THEN
        INSERT INTO projects.workspace_transfers(id,workspace_id,from_project_id,to_project_id,from_membership_id,to_membership_id,workspace_version,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),1,actor,actor);
      WHEN 'record_comments' THEN
        INSERT INTO projects.record_comments(id,record_id,author_id,body,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),actor,'검증 댓글',actor,actor);
      WHEN 'posts' THEN
        INSERT INTO community.posts(id,author_id,body,created_by,updated_by)
          VALUES(r.id,actor,'검증 게시글',actor,actor);
      WHEN 'post_comments' THEN
        INSERT INTO community.post_comments(id,post_id,author_id,body,created_by,updated_by)
          VALUES(r.id,gen_random_uuid(),actor,'검증 댓글',actor,actor);
      WHEN 'reports' THEN
        INSERT INTO community.reports(id,reporter_id,target_user_id,reason_code,target_snapshot,created_by,updated_by)
          VALUES(r.id,actor,gen_random_uuid(),'spam','{}',actor,actor);
    END CASE;
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.expect_failure(statement text, expected_state text, expected_constraint text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text; actual_constraint text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE, actual_constraint = CONSTRAINT_NAME;
  END;
  IF actual_state IS DISTINCT FROM expected_state OR actual_constraint IS DISTINCT FROM expected_constraint
  THEN RAISE EXCEPTION '제약 거부 결과 불일치: %', expected_constraint; END IF;
END $$;

DO $$
DECLARE r record; statement text; checks integer := 0; table_name text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('accounts','users','auth_version = -1','ck_users_auth_version'),
    ('accounts','users','deleted_at = now()','ck_users_erasure'),
    ('accounts','users','nickname = NULL','ck_users_active_secrets'),
    ('accounts','user_identifiers','value = ''qa..invalid''','ck_user_identifiers_format'),
    ('accounts','command_receipts','request_hash = ''invalid''','ck_command_receipts_request_hash'),
    ('accounts','policy_documents','language = ''en''','ck_policy_documents_language'),
    ('accounts','stored_objects','byte_size = -1','ck_stored_objects_integrity'),
    ('accounts','stored_objects','purged_at = now()','ck_stored_objects_purge_state'),
    ('social','friend_requests','recipient_id = sender_id','ck_friend_requests_distinct_users'),
    ('social','friendships','user_high_id = user_low_id','ck_friendships_order'),
    ('social','user_blocks','blocked_id = blocker_id','ck_user_blocks_distinct_users'),
    ('projects','project_invitations','recipient_id = sender_id','ck_project_invitations_distinct_users'),
    ('projects','project_workspaces','status = ''done''','ck_project_workspaces_done_time'),
    ('projects','project_workspaces','version = -1','ck_project_workspaces_version'),
    ('projects','project_counters','value = -1','ck_project_counters_value'),
    ('projects','project_counters','sort_order = -1','ck_project_counters_version_order'),
    ('projects','project_records','duration_seconds = -1','ck_project_records_duration'),
    ('projects','workspace_transfers','to_project_id = from_project_id','ck_workspace_transfers_distinct_projects'),
    ('projects','workspace_transfers','to_membership_id = from_membership_id','ck_workspace_transfers_distinct_memberships'),
    ('projects','workspace_transfers','workspace_version = 0','ck_workspace_transfers_version'),
    ('projects','project_timers','accumulated_seconds = -1','ck_project_timers_duration_version'),
    ('projects','project_timers','started_at = NULL','ck_project_timers_running_time'),
    ('projects','project_timers','status = ''stopped'', started_at = NULL','ck_project_timers_stop_result'),
    ('projects','project_timers','record_id = gen_random_uuid()','ck_project_timers_unfinished_result'),
    ('community','reports','post_id = gen_random_uuid()','ck_reports_one_target'),
    ('community','reports','reason_code = ''other''','ck_reports_other_detail'),
    ('community','reports','status = ''closed''','ck_reports_closed_time')
  ) AS cases(namespace,model,changes,constraint_name) LOOP
    statement := format('UPDATE %I.%I SET %s WHERE id = (SELECT id FROM fixtures WHERE model = %L)',r.namespace,r.model,r.changes,r.model);
    PERFORM pg_temp.expect_failure(statement,'23514',r.constraint_name);
    checks := checks + 1;
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['projects','project_workspaces','project_counters','project_records','record_comments','posts','post_comments'] LOOP
    statement := format('UPDATE %I.%I SET deleted_at = now() WHERE id = (SELECT id FROM fixtures WHERE model = %L)',
      CASE WHEN table_name IN ('posts','post_comments') THEN 'community' ELSE 'projects' END,table_name,table_name);
    PERFORM pg_temp.expect_failure(statement,'23514','ck_' || table_name || '_deletion_operation');
    checks := checks + 1;
  END LOOP;
  IF checks <> 34 THEN RAISE EXCEPTION 'CHECK 테스트 개수가 다릅니다'; END IF;
  RAISE NOTICE 'CHECK 거부 34개 통과, 물리 FK 0개';
END $$;

DO $$
DECLARE r record; original record; new_id uuid;
BEGIN
  SELECT * INTO original FROM projects.project_memberships WHERE id = (SELECT id FROM fixtures WHERE model = 'project_memberships');
  PERFORM pg_temp.expect_failure(format('INSERT INTO projects.project_memberships(id,project_id,user_id,created_by,updated_by) VALUES(%L,%L,%L,%L,%L)',gen_random_uuid(),original.project_id,original.user_id,original.created_by,original.updated_by),'23505','ux_project_memberships_current');
  INSERT INTO projects.project_memberships(id,project_id,user_id,left_at,created_by,updated_by) VALUES(gen_random_uuid(),original.project_id,original.user_id,now(),original.created_by,original.updated_by);

  SELECT * INTO original FROM social.friend_requests WHERE id = (SELECT id FROM fixtures WHERE model = 'friend_requests');
  PERFORM pg_temp.expect_failure(format('INSERT INTO social.friend_requests(id,sender_id,recipient_id,created_by,updated_by) VALUES(%L,%L,%L,%L,%L)',gen_random_uuid(),original.recipient_id,original.sender_id,original.created_by,original.updated_by),'23505','ux_friend_requests_pending_pair');
  INSERT INTO social.friend_requests(id,sender_id,recipient_id,status,created_by,updated_by) VALUES(gen_random_uuid(),original.recipient_id,original.sender_id,'cancelled',original.created_by,original.updated_by);

  SELECT * INTO original FROM projects.project_invitations WHERE id = (SELECT id FROM fixtures WHERE model = 'project_invitations');
  PERFORM pg_temp.expect_failure(format('INSERT INTO projects.project_invitations(id,project_id,sender_id,recipient_id,created_by,updated_by) VALUES(%L,%L,%L,%L,%L,%L)',gen_random_uuid(),original.project_id,original.sender_id,original.recipient_id,original.created_by,original.updated_by),'23505','ux_project_invitations_pending');
  INSERT INTO projects.project_invitations(id,project_id,sender_id,recipient_id,status,created_by,updated_by) VALUES(gen_random_uuid(),original.project_id,original.sender_id,original.recipient_id,'cancelled',original.created_by,original.updated_by);

  SELECT * INTO original FROM projects.project_timers WHERE id = (SELECT id FROM fixtures WHERE model = 'project_timers');
  PERFORM pg_temp.expect_failure(format('INSERT INTO projects.project_timers(id,workspace_id,owner_user_id,status,created_by,updated_by) VALUES(%L,%L,%L,''paused'',%L,%L)',gen_random_uuid(),original.workspace_id,original.owner_user_id,original.created_by,original.updated_by),'23505','ux_project_timers_current');
  INSERT INTO projects.project_timers(id,workspace_id,owner_user_id,status,stopped_at,record_id,created_by,updated_by) VALUES(gen_random_uuid(),original.workspace_id,original.owner_user_id,'stopped',now(),gen_random_uuid(),original.created_by,original.updated_by);
  RAISE NOTICE '부분 고유 인덱스 거부·종료 이력 허용 4개 통과';
END $$;

-- 정상·실패 사례의 임시 행과 보조 객체를 모두 롤백합니다.
ROLLBACK;
