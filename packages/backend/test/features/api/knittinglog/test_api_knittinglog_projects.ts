import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

// V1-401~405, DB-DS-001: 방장 참여와 개인 작업 공간 및 기본 카운터를 함께 생성합니다.
export async function test_api_knittinglog_project_defaults(connection: K.Connection): Promise<void> {
  const owner = await K.register(connection);
  const outsider = await K.register(connection);
  const project = await K.project(owner);
  K.uuid(project.id);
  assert.equal(project.owner_user_id, owner.session.user.id);
  const memberships = typia.assert<K.Membership[]>(await K.request(owner.connection, "GET", `/projects/${project.id}/memberships`, 200), K.invalidResponse);
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0]!.user_id, owner.session.user.id);
  assert.equal(memberships[0]!.left_at, null);
  const workspace = await K.workspace(owner, project.id);
  assert.equal(workspace.status, "active");
  assert.equal(workspace.ended_at, null);
  const counters = await K.counters(owner, workspace.id);
  assert.equal(counters.length, 2);
  assert.equal(new Set(counters.map((entry) => entry.id)).size, 2);
  for (const counter of counters) {
    assert.equal(counter.workspace_id, workspace.id);
    assert.equal(counter.value, 0);
  }
  const projects = typia.assert<K.Project[]>(await K.request(owner.connection, "GET", "/projects?status=active", 200), K.invalidResponse);
  assert.ok(projects.some((entry) => entry.id === project.id));
  await K.error(outsider.connection, "GET", `/projects/${project.id}`, 404);
  await K.error(outsider.connection, "GET", `/projects/${project.id}/workspaces`, 404);
  await K.error(owner.connection, "GET", `/projects/${randomUUID()}`, 404);
}

// V1-403, DB-FK-005: 거부된 동시 생성·초대 요청은 프로젝트를 남기지 않습니다.
export async function test_api_knittinglog_project_invitation_atomicity(connection: K.Connection): Promise<void> {
  const [owner, friend, nonfriend] = await Promise.all([K.register(connection), K.register(connection), K.register(connection)]);
  await K.befriend(owner, friend);
  const before = typia.assert<K.Project[]>(await K.request(owner.connection, "GET", "/projects", 200), K.invalidResponse);
  await K.error(owner.connection, "POST", "/projects", 403, {
    name: `qa_invalid_${randomUUID()}`, invitee_user_ids: [friend.session.user.id, nonfriend.session.user.id],
  });
  const after = typia.assert<K.Project[]>(await K.request(owner.connection, "GET", "/projects", 200), K.invalidResponse);
  assert.deepEqual(after.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)), before.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)));
  const inbox = typia.assert<K.Invitation[]>(await K.request(friend.connection, "GET", "/project-invitations?status=pending", 200), K.invalidResponse);
  assert.equal(inbox.length, 0);
  const project = await K.project(owner, [friend.session.user.id]);
  const invitations = typia.assert<K.Invitation[]>(await K.request(friend.connection, "GET", "/project-invitations?status=pending", 200), K.invalidResponse);
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0]!.project_id, project.id);
  await K.request(owner.connection, "DELETE", `/project-invitations/${invitations[0]!.id}`, 204);
  const remaining = typia.assert<K.Invitation[]>(await K.request(friend.connection, "GET", "/project-invitations?status=pending", 200), K.invalidResponse);
  assert.equal(remaining.length, 0);
}

// V1-501~504, DB-FK-006: 동시 수락은 유효한 참여와 작업 공간 및 기본 카운터를 중복 생성하지 않습니다.
export async function test_api_knittinglog_concurrent_invitation_acceptance(connection: K.Connection): Promise<void> {
  const [owner, member, outsider] = await Promise.all([K.register(connection), K.register(connection), K.register(connection)]);
  await K.befriend(owner, member);
  const project = await K.project(owner);
  const invitation = typia.assert<K.Invitation>(await K.request(owner.connection, "POST", `/projects/${project.id}/invitations`, 201, { recipient_id: member.session.user.id }), K.invalidResponse);
  await K.error(owner.connection, "POST", `/projects/${project.id}/invitations`, 409, { recipient_id: member.session.user.id });
  await K.error(outsider.connection, "POST", `/project-invitations/${invitation.id}/accept`, 403);
  const accepted = await Promise.all([0, 1].map(async () => typia.assert<K.Membership>(
    await K.request(member.connection, "POST", `/project-invitations/${invitation.id}/accept`, 200), K.invalidResponse,
  )));
  assert.equal(accepted[0]!.id, accepted[1]!.id);
  const memberships = typia.assert<K.Membership[]>(await K.request(owner.connection, "GET", `/projects/${project.id}/memberships`, 200), K.invalidResponse);
  assert.equal(memberships.filter((entry) => entry.user_id === member.session.user.id && entry.left_at === null).length, 1);
  const workspace = await K.workspace(member, project.id);
  assert.equal((await K.counters(member, workspace.id)).length, 2);
  await K.request(member.connection, "PATCH", "/users/me", 200, { visibility: "private" });
  const visible = typia.assert<K.Workspace[]>(await K.request(owner.connection, "GET", `/projects/${project.id}/workspaces`, 200), K.invalidResponse);
  assert.ok(visible.some((entry) => entry.id === workspace.id), "공동 프로젝트 조회는 프로필 공개 범위와 구분합니다.");
}

// V1-407, V1-505: 방장 기준은 하나이며 유효하지 않은 후임에게 양도하지 않습니다.
export async function test_api_knittinglog_owner_transfer(connection: K.Connection): Promise<void> {
  const [owner, member, outsider] = await Promise.all([K.register(connection), K.register(connection), K.register(connection)]);
  await K.befriend(owner, member);
  const project = await K.project(owner);
  await K.join(owner, member, project.id);
  await K.error(member.connection, "PATCH", `/projects/${project.id}`, 403, { name: "권한 없는 변경" });
  await K.error(owner.connection, "PATCH", `/projects/${project.id}/owner`, 409, { owner_user_id: outsider.session.user.id });
  const unchanged = typia.assert<K.Project>(await K.request(owner.connection, "GET", `/projects/${project.id}`, 200), K.invalidResponse);
  assert.equal(unchanged.owner_user_id, owner.session.user.id);
  const moved = typia.assert<K.Project>(await K.request(owner.connection, "PATCH", `/projects/${project.id}/owner`, 200, { owner_user_id: member.session.user.id }), K.invalidResponse);
  assert.equal(moved.owner_user_id, member.session.user.id);
  await K.error(owner.connection, "PATCH", `/projects/${project.id}`, 403, { name: "이전 방장의 변경" });
  const renamed = typia.assert<K.Project>(await K.request(member.connection, "PATCH", `/projects/${project.id}`, 200, { name: "새 프로젝트 이름" }), K.invalidResponse);
  assert.equal(renamed.name, "새 프로젝트 이름");
}

// 확정 정책 6.2: 동시 초대 수락에서도 방장을 포함한 참여자는 20명을 넘지 않습니다.
export async function test_api_knittinglog_project_member_limit(connection: K.Connection): Promise<void> {
  const owner = await K.register(connection);
  const project = await K.project(owner);
  for (let index = 0; index < 18; index++) {
    const member = await K.register(connection);
    await K.befriend(owner, member);
    await K.join(owner, member, project.id);
  }
  const last = [await K.register(connection), await K.register(connection)];
  const invitations: K.Invitation[] = [];
  for (const actor of last) {
    await K.befriend(owner, actor);
    invitations.push(typia.assert<K.Invitation>(await K.request(owner.connection, "POST", `/projects/${project.id}/invitations`, 201, {
      recipient_id: actor.session.user.id,
    }), K.invalidResponse));
  }
  const accepted = await Promise.all(last.map((actor, index) => K.outcome(actor.connection, "POST", `/project-invitations/${invitations[index]!.id}/accept`)));
  assert.deepEqual(accepted.map((entry) => entry.status).sort((a, b) => a - b), [200, 409]);
  const memberships = typia.assert<K.Membership[]>(await K.request(owner.connection, "GET", `/projects/${project.id}/memberships`, 200), K.invalidResponse);
  assert.equal(memberships.length, 20);
  const rejected = last[accepted.findIndex((entry) => entry.status === 409)]!;
  await K.error(rejected.connection, "GET", `/projects/${project.id}`, 404, undefined);
}
