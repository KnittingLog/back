const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { getDMMF } = require("@prisma/internals");

const root = path.resolve(__dirname, "..");
const schemaPath = path.join(root, "prisma/schema/main.prisma");
const erdPath = path.join(root, "docs/ERD.md");
const constraintsPath = path.join(root, "prisma/design-constraints.sql");
const expectedModels = [
  "users", "auth_sessions", "policy_documents", "policy_consents",
  "friend_requests", "friendships", "user_blocks", "projects",
  "project_memberships", "project_invitations", "project_counters",
  "project_records", "record_comments", "record_reactions", "posts",
  "post_comments", "post_likes", "reports", "project_workspaces",
  "workspace_transfers", "stored_objects",
  "project_timers", "command_receipts", "user_identifiers", "recovery_codes",
  "system_principals", "report_actions",
];
const auditColumns = [
  "created_at", "created_by", "updated_at", "updated_by", "deleted_at",
];
const contentModels = [
  "projects", "project_workspaces", "project_counters", "project_records",
  "record_comments", "posts", "post_comments",
];
const expectedChecks = [
  ["projects", "project_workspaces", "done_time", "(status = 'done') = (ended_at IS NOT NULL)"],
  ["projects", "project_workspaces", "version", "version >= 0"],
  ["projects", "project_counters", "value", "value >= 0 AND (target_value IS NULL OR target_value >= 0)"],
  ["projects", "project_records", "duration", "duration_seconds >= 0"],
  ["social", "friendships", "order", "user_low_id < user_high_id"],
  ["social", "friend_requests", "distinct_users", "sender_id <> recipient_id"],
  ["social", "user_blocks", "distinct_users", "blocker_id <> blocked_id"],
  ["projects", "project_invitations", "distinct_users", "sender_id <> recipient_id"],
  ["community", "reports", "one_target", "(target_user_id IS NOT NULL) <> (post_id IS NOT NULL)"],
  ["projects", "workspace_transfers", "distinct_projects", "from_project_id <> to_project_id"],
  ["projects", "workspace_transfers", "distinct_memberships", "from_membership_id <> to_membership_id"],
  ["projects", "workspace_transfers", "version", "workspace_version > 0"],
  ["accounts", "stored_objects", "integrity", "byte_size >= 0 AND sha256 ~ '^[0-9a-f]{64}$'"],
  ["accounts", "stored_objects", "purge_state", "purged_at IS NULL OR deleted_at IS NOT NULL"],
  ["accounts", "users", "auth_version", "auth_version >= 0"],
  ["accounts", "users", "erasure", "deleted_at IS NULL OR (password_hash IS NULL AND handle IS NULL AND nickname IS NULL AND biography IS NULL AND profile_photo_object_id IS NULL)"],
  ["accounts", "users", "active_secrets", "deleted_at IS NOT NULL OR (password_hash IS NOT NULL AND handle IS NOT NULL AND nickname IS NOT NULL)"],
  ["accounts", "user_identifiers", "format", "value ~ '^[a-z0-9][a-z0-9_.]{1,30}[a-z0-9]$' AND value NOT LIKE '%..%'"],
  ["accounts", "command_receipts", "request_hash", "request_hash ~ '^[0-9a-f]{64}$'"],
  ["accounts", "policy_documents", "language", "language = 'ko'"],
  ["projects", "project_counters", "version_order", "version >= 0 AND sort_order >= 0"],
  ["projects", "project_timers", "duration_version", "accumulated_seconds >= 0 AND version >= 0"],
  ["projects", "project_timers", "running_time", "(status = 'running') = (started_at IS NOT NULL)"],
  ["projects", "project_timers", "stop_result", "(status = 'stopped') = (stopped_at IS NOT NULL AND record_id IS NOT NULL)"],
  ["projects", "project_timers", "unfinished_result", "status = 'stopped' OR (stopped_at IS NULL AND record_id IS NULL)"],
  ["community", "reports", "other_detail", "reason_code <> 'other' OR (detail IS NOT NULL AND length(btrim(detail)) > 0)"],
  ["community", "reports", "closed_time", "(status = 'closed') = (closed_at IS NOT NULL)"],
];
const expectedPartialIndexes = [
  ["ux_project_memberships_current", "projects.project_memberships", "project_id, user_id", "left_at IS NULL AND deleted_at IS NULL"],
  ["ux_friend_requests_pending_pair", "social.friend_requests", "LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id)", "status = 'pending' AND deleted_at IS NULL"],
  ["ux_project_invitations_pending", "projects.project_invitations", "project_id, recipient_id", "status = 'pending' AND deleted_at IS NULL"],
  ["ux_project_timers_current", "projects.project_timers", "workspace_id", "status IN ('running', 'paused') AND deleted_at IS NULL"],
];

async function main() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  const erd = fs.readFileSync(erdPath, "utf8");
  const { datamodel } = await getDMMF({ datamodel: schema });
  assert.deepEqual(datamodel.models.map((m) => m.name).sort(), expectedModels.sort());
  assert.match(schema, /relationMode\s*=\s*"prisma"/);
  assert.doesNotMatch(schema, /onDelete:\s*(Cascade|SetNull)/);

  // 권한 관계와 개인 데이터 소유 관계의 분리를 검사합니다.
  const modelByName = new Map(datamodel.models.map((model) => [model.name, model]));
  const field = (model, name) => {
    const found = modelByName.get(model)?.fields.find((candidate) => candidate.name === name);
    assert.ok(found, `${model}.${name} 누락`);
    return found;
  };
  // 확정 정책의 저장 계약을 먼저 검사합니다. DB 실행을 대신하지 않습니다.
  for (const name of ["password_hash", "handle", "nickname"]) assert.equal(field("users", name).isRequired, false);
  assert.equal(field("users", "auth_version").default, 0);
  assert.equal(field("auth_sessions", "access_token_hash").isUnique, true);
  assert.equal(field("auth_sessions", "access_expires_at").isRequired, true);
  assert.equal(field("projects", "terminated_at").isRequired, false);
  assert.equal(field("policy_documents", "language").default, "ko");
  assert.equal(field("policy_documents", "effective_at").isRequired, true);
  assert.equal(field("policy_documents", "requires_reconsent").type, "Boolean");
  assert.deepEqual(modelByName.get("policy_documents").uniqueFields, [["code", "version"], ["code", "effective_at"]]);
  assert.deepEqual(modelByName.get("user_identifiers").uniqueFields, [["kind", "value"]]);
  for (const name of ["code_hash", "used_at", "revoked_at"]) field("recovery_codes", name);
  assert.equal(field("system_principals", "id").hasDefaultValue, false);
  assert.equal(field("command_receipts", "id").hasDefaultValue, false);
  assert.equal(field("command_receipts", "result").type, "Json");
  for (const name of ["is_visible", "sort_order", "version"]) assert.equal(field("project_counters", name).isRequired, true);
  for (const name of ["started_at", "accumulated_seconds", "stopped_at", "record_id", "owner_user_id", "version"]) field("project_timers", name);
  assert.deepEqual(field("project_timers", "workspace").relationFromFields, ["workspace_id"]);
  assert.equal(field("reports", "status").type, "e_report_status");
  for (const name of ["report_id", "action_code", "reason", "result"]) field("report_actions", name);
  const enumValues = (name) => datamodel.enums.find((type) => type.name === name)?.values.map((value) => value.name);
  assert.deepEqual(enumValues("e_timer_status"), ["running", "paused", "stopped"]);
  assert.deepEqual(enumValues("e_reaction_code"), ["like", "heart", "clap", "celebrate", "wow"]);
  assert.deepEqual(enumValues("e_report_reason"), ["spam", "abuse", "inappropriate", "privacy", "other"]);
  assert.equal(field("record_reactions", "emoji_code").type, "e_reaction_code");
  assert.equal(field("reports", "reason_code").type, "e_report_reason");
  const membership = modelByName.get("project_memberships");
  for (const name of ["status", "yarn_notes", "needle_notes", "ended_at", "counters", "records"]) {
    assert.ok(!membership.fields.some((candidate) => candidate.name === name), `참여 관계에 개인 데이터 ${name} 잔존`);
  }
  assert.equal(field("project_memberships", "left_at").isRequired, false);
  assert.equal(membership.uniqueFields.length, 0);
  assert.equal(field("project_workspaces", "status").type, "e_workspace_status");
  assert.equal(field("project_workspaces", "version").default, 0);
  assert.deepEqual(modelByName.get("project_workspaces").uniqueFields, [["project_id", "owner_user_id"]]);
  for (const name of ["project_counters", "project_records"]) {
    assert.ok(!modelByName.get(name).fields.some((candidate) => candidate.name === "membership_id"));
    assert.deepEqual(field(name, "workspace").relationFromFields, ["workspace_id"]);
    assert.equal(field(name, "workspace").type, "project_workspaces");
  }
  assert.equal(field("workspace_transfers", "id").hasDefaultValue, false);
  assert.deepEqual(modelByName.get("workspace_transfers").uniqueFields, [["workspace_id", "workspace_version"]]);
  assert.equal(field("reports", "target_snapshot").type, "Json");
  assert.equal(field("reports", "target_snapshot").isRequired, true);
  for (const [name, relation, oldName] of [
    ["users", "profile_photo", "profile_photo_url"],
    ["projects", "cover_photo", "cover_photo_url"],
  ]) {
    assert.equal(field(name, relation).type, "stored_objects");
    assert.ok(!modelByName.get(name).fields.some((candidate) => candidate.name === oldName));
  }
  for (const name of contentModels) {
    assert.equal(field(name, "deletion_operation_id").isRequired, false);
  }
  assert.deepEqual(field("stored_objects", "owner").relationFromFields, ["owner_user_id"]);
  for (const name of ["owner_user_id", "storage_code", "object_key", "sha256", "byte_size"]) {
    assert.equal(field("stored_objects", name).isRequired, true);
  }

  let relations = 0;
  for (const model of datamodel.models) {
    assert.ok(["accounts", "social", "projects", "community"].includes(model.schema));
    assert.match(model.name, /^[a-z_][a-z0-9_]*$/);
    assert.ok(Buffer.byteLength(model.name) <= 63);
    for (const name of auditColumns) {
      const field = model.fields.find((f) => f.name === name);
      assert.ok(field, `${model.name}.${name} 누락`);
      assert.equal(field.isRequired, name !== "deleted_at");
    }
    for (const field of model.fields) {
      assert.match(field.name, /^[a-z_][a-z0-9_]*$/);
      assert.ok(Buffer.byteLength(field.name) <= 63);
      if (field.kind !== "object") {
        assert.ok(field.documentation?.length, `${model.name}.${field.name} 설명 누락`);
      }
      if (field.relationFromFields?.length) relations += 1;
    }
    assert.ok(erd.includes(`### \`${model.name}\``), `${model.name} ERD 설명 누락`);
  }
  for (const type of datamodel.enums) {
    assert.match(type.name, /^e_[a-z0-9_]+$/);
    for (const value of type.values) assert.match(value.name, /^[a-z0-9_]+$/);
  }

  // SQL 계약은 정적으로 비교합니다. 제약 실행과 동시성 동작은 검증하지 않습니다.
  const constraints = fs.readFileSync(constraintsPath, "utf8").replace(/--[^\n]*/g, "");
  const normalized = constraints.replace(/\s+/g, " ").trim();
  const checks = [...expectedChecks, ...contentModels.map((name) => [
    modelByName.get(name).schema, name, "deletion_operation",
    "(deleted_at IS NULL) = (deletion_operation_id IS NULL)",
  ])];
  const sqlStatements = constraints.split(";").map((statement) => statement.replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const [namespace, name, suffix, expression] of checks) {
    const declaration = `ADD CONSTRAINT ck_${name}_${suffix} CHECK (${expression})`;
    assert.ok(sqlStatements.some((statement) => statement.startsWith(`ALTER TABLE ${namespace}.${name} `) && statement.includes(declaration)), `${name}.${suffix} CHECK 불일치`);
  }
  assert.equal((normalized.match(/ADD CONSTRAINT /g) ?? []).length, checks.length);
  for (const [name, table, columns, predicate] of expectedPartialIndexes) {
    const declaration = `CREATE UNIQUE INDEX ${name} ON ${table} (${columns}) WHERE ${predicate}`;
    assert.ok(sqlStatements.includes(declaration), `${name} 부분 고유 인덱스 불일치`);
  }
  assert.equal((normalized.match(/CREATE UNIQUE INDEX /g) ?? []).length, expectedPartialIndexes.length);
  assert.doesNotMatch(constraints, /\bFOREIGN\s+KEY\b|\bREFERENCES\b|\b(?:DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i);
  for (const match of constraints.matchAll(/(?:ADD CONSTRAINT|CREATE UNIQUE INDEX)\s+(\w+)/g)) {
    assert.match(match[1], /^(ck|ux)_[a-z0-9_]+$/);
    assert.ok(Buffer.byteLength(match[1]) <= 63);
  }

  // 빈 모델과 스키마만 비교합니다. 실제 DB의 조회·변경 인수는 사용하지 않습니다.
  const manifestPath = require.resolve("prisma/package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const cli = path.resolve(path.dirname(manifestPath), manifest.bin.prisma);
  const sql = execFileSync(process.execPath, [
    cli, "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema", "--script",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      POSTGRES_URL: "postgresql://schema_check:schema_check@127.0.0.1:1/schema_check",
    },
  });
  assert.doesNotMatch(sql, /\bFOREIGN\s+KEY\b|\bREFERENCES\b/i);
  assert.doesNotMatch(sql, /bbs_|attachment_files/);
  assert.equal((sql.match(/CREATE TABLE /g) ?? []).length, expectedModels.length);
  assert.equal((sql.match(/PRIMARY KEY/g) ?? []).length, expectedModels.length);
  for (const match of sql.matchAll(/"([^"\n]+)"/g)) {
    assert.match(match[1], /^[a-z_][a-z0-9_]*$/);
    assert.ok(Buffer.byteLength(match[1]) <= 63);
  }
  for (const match of sql.matchAll(/CONSTRAINT "([^"]+)"/g)) assert.match(match[1], /^pk_/);
  for (const match of sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)) {
    assert.match(match[1], /^(ix|ux)_/);
  }
  assert.doesNotMatch(erd, /bbs_|attachment_files/);
  assert.equal((erd.match(/^```/gm) ?? []).length % 2, 0);
  assert.ok(!/\b(?:membership_id|profile_photo_url|cover_photo_url|e_member_status)\b/.test(erd), "ERD에 이전 소유 관계 또는 사진 URL 컬럼이 남아 있습니다.");
  console.log(`ERD 정적 검증 통과: ${datamodel.models.length}개 모델, ${relations}개 논리 관계, CHECK 설계 ${checks.length}개, 부분 고유 인덱스 설계 ${expectedPartialIndexes.length}개, 생성 SQL의 물리 FK 0개`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
