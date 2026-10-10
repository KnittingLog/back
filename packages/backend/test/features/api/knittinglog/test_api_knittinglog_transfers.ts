import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

async function sharedProject(connection: K.Connection) {
  const [owner, member] = await Promise.all([K.register(connection), K.register(connection)]);
  await K.befriend(owner, member);
  const project = await K.project(owner);
  const membership = await K.join(owner, member, project.id);
  const workspace = await K.workspace(member, project.id);
  return { owner, member, project, membership, workspace };
}

// V1-507, DB-DS-002: 이관과 재시도는 원 작성자·댓글·반응·카운터 식별자를 보존합니다.
export async function test_api_knittinglog_leave_preserves_data(connection: K.Connection): Promise<void> {
  const emoji = K.fixtureCode("KNITTINGLOG_TEST_EMOJI_CODE");
  const { owner, member, project, membership, workspace } = await sharedProject(connection);
  const counter = (await K.counters(member, workspace.id))[0]!;
  await K.request(member.connection, "POST", `/counters/${counter.id}/adjust`, 200, { delta: 1, operation_id: randomUUID() });
  const record = await K.record(member, workspace.id);
  const comment = typia.assert<K.Comment>(await K.request(owner.connection, "POST", `/records/${record.id}/comments`, 201, { body: "이관 전 댓글" }), K.invalidResponse);
  const reaction = typia.assert<K.Reaction>(await K.request(owner.connection, "PUT", `/records/${record.id}/reactions/${encodeURIComponent(emoji)}`, 200), K.invalidResponse);
  const beforeTimer = await K.workspace(member, project.id);
  const running = typia.assert<K.Timer>(await K.request(member.connection, "POST", `/workspaces/${workspace.id}/timer/start`, 201, {
    operation_id: randomUUID(), expected_version: beforeTimer.version,
  }), K.invalidResponse);
  const before = await K.workspace(member, project.id);
  const payload = { operation_id: randomUUID(), workspace_id: workspace.id, expected_version: before.version };
  const moved = typia.assert<K.Transfer>(await K.request(member.connection, "POST", `/projects/${project.id}/leave`, 200, payload), K.invalidResponse);
  assert.equal(moved.id, payload.operation_id);
  assert.equal(moved.workspace_id, workspace.id);
  assert.equal(moved.from_project_id, project.id);
  assert.equal(moved.from_membership_id, membership.id);
  assert.notEqual(moved.to_project_id, project.id);
  const personal = typia.assert<K.Project>(await K.request(member.connection, "GET", `/projects/${moved.to_project_id}`, 200), K.invalidResponse);
  assert.equal(personal.owner_user_id, member.session.user.id);
  assert.equal(personal.name, project.name);
  const after = await K.workspace(member, personal.id);
  assert.equal(after.id, workspace.id);
  assert.equal(after.version, moved.workspace_version);
  assert.ok(after.version > before.version);
  const counters = await K.counters(member, workspace.id);
  assert.equal(counters.length, 2);
  assert.equal(counters.find((entry) => entry.id === counter.id)!.value, 1);
  const preserved = typia.assert<K.Record>(await K.request(member.connection, "GET", `/records/${record.id}`, 200), K.invalidResponse);
  assert.equal(preserved.author_id, member.session.user.id);
  assert.equal(preserved.workspace_id, workspace.id);
  const comments = typia.assert<K.Comment[]>(await K.request(member.connection, "GET", `/records/${record.id}/comments`, 200), K.invalidResponse);
  assert.equal(comments[0]!.id, comment.id);
  assert.equal(comments[0]!.author_id, owner.session.user.id);
  const reactions = typia.assert<K.Reaction[]>(await K.request(member.connection, "GET", `/records/${record.id}/reactions`, 200), K.invalidResponse);
  assert.equal(reactions[0]!.id, reaction.id);
  assert.equal(reactions[0]!.user_id, owner.session.user.id);
  const transferredTimer = typia.assert<K.Timer>(await K.request(member.connection, "GET", `/workspaces/${workspace.id}/timer`, 200), K.invalidResponse);
  assert.equal(transferredTimer.id, running.id);
  assert.equal(transferredTimer.owner_user_id, running.owner_user_id);
  assert.equal(transferredTimer.status, "running", "이관은 진행 중 타이머를 보존합니다.");
  await K.error(owner.connection, "GET", `/workspaces/${workspace.id}`, 404);
  await K.error(owner.connection, "GET", `/records/${record.id}`, 404);
  await K.error(owner.connection, "DELETE", `/record-comments/${comment.id}`, 404, undefined);
  const replay = typia.assert<K.Transfer>(await K.request(member.connection, "POST", `/projects/${project.id}/leave`, 200, payload), K.invalidResponse);
  assert.deepEqual(replay, moved);
  await K.error(member.connection, "POST", `/projects/${project.id}/leave`, 409, { ...payload, workspace_id: randomUUID() });
  const projects = typia.assert<K.Project[]>(await K.request(member.connection, "GET", "/projects", 200), K.invalidResponse);
  assert.deepEqual(projects.map((entry) => entry.id), [personal.id], "재시도는 개인 프로젝트를 중복 생성하지 않습니다.");
}

// V1-701, 확정 정책 6.1: 이관은 실행 타이머의 식별자와 소유자를 보존합니다.
export async function test_api_knittinglog_transfer_running_timer(connection: K.Connection): Promise<void> {
  const { owner, member, project, workspace } = await sharedProject(connection);
  const prefix = `/workspaces/${workspace.id}/timer`;
  const running = typia.assert<K.Timer>(await K.request(member.connection, "POST", `${prefix}/start`, 201, {
    operation_id: randomUUID(), expected_version: workspace.version,
  }), K.invalidResponse);
  assert.equal(running.status, "running");
  const before = await K.workspace(member, project.id);
  const moved = typia.assert<K.Transfer>(await K.request(member.connection, "POST", `/projects/${project.id}/leave`, 200, {
    operation_id: randomUUID(), workspace_id: workspace.id, expected_version: before.version,
  }), K.invalidResponse);
  const after = await K.workspace(member, moved.to_project_id);
  assert.equal(after.id, workspace.id);
  const preserved = typia.assert<K.Timer>(await K.request(member.connection, "GET", prefix, 200), K.invalidResponse);
  assert.equal(preserved.id, running.id);
  assert.equal(preserved.workspace_id, workspace.id);
  assert.equal(preserved.owner_user_id, member.session.user.id);
  assert.equal(preserved.status, "running");
  assert.equal(preserved.started_at, running.started_at);
  assert.ok(preserved.accumulated_seconds >= running.accumulated_seconds);
  await K.error(owner.connection, "GET", prefix, 404);
  await K.error(owner.connection, "POST", `${prefix}/pause`, 404, {
    operation_id: randomUUID(), expected_version: after.version,
  });
  const paused = typia.assert<K.Timer>(await K.request(member.connection, "POST", `${prefix}/pause`, 200, {
    operation_id: randomUUID(), expected_version: after.version,
  }), K.invalidResponse);
  assert.equal(paused.id, running.id);
  assert.equal(paused.status, "paused");
}

// DB-DS-001~002: 재가입은 새 참여 기간과 작업 공간을 만들고 이전 개인 데이터를 유지합니다.
export async function test_api_knittinglog_rejoin_and_leave(connection: K.Connection): Promise<void> {
  const { owner, member, project, membership, workspace } = await sharedProject(connection);
  const first = typia.assert<K.Transfer>(await K.request(member.connection, "POST", `/projects/${project.id}/leave`, 200, {
    operation_id: randomUUID(), workspace_id: workspace.id, expected_version: workspace.version,
  }), K.invalidResponse);
  const joined = await K.join(owner, member, project.id);
  assert.notEqual(joined.id, membership.id);
  const fresh = await K.workspace(member, project.id);
  assert.notEqual(fresh.id, workspace.id);
  const original = await K.workspace(member, first.to_project_id);
  assert.equal(original.id, workspace.id);
  const second = typia.assert<K.Transfer>(await K.request(member.connection, "POST", `/projects/${project.id}/leave`, 200, {
    operation_id: randomUUID(), workspace_id: fresh.id, expected_version: fresh.version,
  }), K.invalidResponse);
  assert.notEqual(second.to_project_id, first.to_project_id);
  const history = typia.assert<K.Membership[]>(await K.request(member.connection, "GET", "/users/me/memberships", 200), K.invalidResponse);
  const ended = history.filter((entry) => entry.project_id === project.id);
  assert.deepEqual(ended.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)), [membership.id, joined.id].sort((a, b) => a.localeCompare(b)));
  assert.ok(ended.every((entry) => entry.left_at !== null));
  const active = typia.assert<K.Membership[]>(await K.request(owner.connection, "GET", `/projects/${project.id}/memberships`, 200), K.invalidResponse);
  assert.ok(!active.some((entry) => entry.user_id === member.session.user.id));
}

// V1-506: 추방은 방장만 수행하며 이관 데이터의 소유자를 변경하지 않습니다.
export async function test_api_knittinglog_kick_authority(connection: K.Connection): Promise<void> {
  const { owner, member, project, workspace } = await sharedProject(connection);
  const payload = { operation_id: randomUUID(), workspace_id: workspace.id, expected_version: workspace.version };
  await K.error(member.connection, "POST", `/projects/${project.id}/members/${member.session.user.id}/kick`, 403, payload);
  const moved = typia.assert<K.Transfer>(await K.request(owner.connection, "POST", `/projects/${project.id}/members/${member.session.user.id}/kick`, 200, payload), K.invalidResponse);
  const personal = typia.assert<K.Project>(await K.request(member.connection, "GET", `/projects/${moved.to_project_id}`, 200), K.invalidResponse);
  assert.equal(personal.owner_user_id, member.session.user.id);
  assert.equal((await K.workspace(member, personal.id)).id, workspace.id);
  await K.error(owner.connection, "GET", `/projects/${personal.id}`, 404);
  await K.error(member.connection, "GET", `/projects/${project.id}`, 404);
}

// V1-505~507, DB-FK-005: 방장 나가기는 후임 지정과 이관을 함께 처리합니다.
export async function test_api_knittinglog_owner_leave_atomicity(connection: K.Connection): Promise<void> {
  const { owner, member, project } = await sharedProject(connection);
  const workspace = await K.workspace(owner, project.id);
  const payload = { operation_id: randomUUID(), workspace_id: workspace.id, expected_version: workspace.version };
  await K.error(owner.connection, "POST", `/projects/${project.id}/leave`, 409, payload);
  await K.error(owner.connection, "POST", `/projects/${project.id}/leave`, 409, { ...payload, successor_user_id: randomUUID() });
  const unchanged = typia.assert<K.Project>(await K.request(owner.connection, "GET", `/projects/${project.id}`, 200), K.invalidResponse);
  assert.equal(unchanged.owner_user_id, owner.session.user.id);
  const kept = await K.workspace(owner, project.id);
  assert.equal(kept.id, workspace.id);
  assert.equal(kept.version, workspace.version);
  const moved = typia.assert<K.Transfer>(await K.request(owner.connection, "POST", `/projects/${project.id}/leave`, 200, {
    ...payload, operation_id: randomUUID(), successor_user_id: member.session.user.id,
  }), K.invalidResponse);
  const handed = typia.assert<K.Project>(await K.request(member.connection, "GET", `/projects/${project.id}`, 200), K.invalidResponse);
  assert.equal(handed.owner_user_id, member.session.user.id);
  assert.equal((await K.workspace(owner, moved.to_project_id)).id, workspace.id);
}

// DB-FK-006, DB-DS-002: 이관과 이전 멤버의 새 댓글은 같은 작업 공간의 변경 번호로 직렬화합니다.
export async function test_api_knittinglog_transfer_comment_race(connection: K.Connection): Promise<void> {
  const { owner, member, project, workspace } = await sharedProject(connection);
  const record = await K.record(member, workspace.id);
  const before = await K.workspace(member, project.id);
  const [transfer, comment] = await Promise.all([
    K.outcome(member.connection, "POST", `/projects/${project.id}/leave`, {
      operation_id: randomUUID(), workspace_id: workspace.id, expected_version: before.version,
    }),
    K.outcome(owner.connection, "POST", `/records/${record.id}/comments`, { body: "경쟁 중인 댓글" }),
  ]);
  assert.ok((transfer.status === 200 && comment.status === 404) || (transfer.status === 409 && comment.status === 201), "경쟁 작업이 권한 검사와 변경 번호 검사를 우회했습니다.");
  if (transfer.status === 200) {
    const moved = typia.assert<K.Transfer>(transfer.body, K.invalidResponse);
    assert.equal((await K.workspace(member, moved.to_project_id)).id, workspace.id);
    const comments = typia.assert<K.Comment[]>(await K.request(member.connection, "GET", `/records/${record.id}/comments`, 200), K.invalidResponse);
    assert.equal(comments.length, 0);
  } else {
    const kept = await K.workspace(member, project.id);
    assert.equal(kept.id, workspace.id);
    assert.ok(kept.version > before.version);
    const projects = typia.assert<K.Project[]>(await K.request(member.connection, "GET", "/projects", 200), K.invalidResponse);
    assert.deepEqual(projects.map((entry) => entry.id), [project.id]);
  }
}
