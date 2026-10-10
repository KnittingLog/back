import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

// V1-204~205, V1-601~603, V1-605: 완료된 시간의 입력 경로와 개인 합계를 검증합니다.
export async function test_api_knittinglog_record_sources(connection: K.Connection): Promise<void> {
  const [actor, observer] = await Promise.all([K.register(connection), K.register(connection)]);
  const project = await K.project(actor);
  const workspace = await K.workspace(actor, project.id);
  const manual = await K.record(actor, workspace.id, 60);
  const timer = typia.assert<K.Record>(await K.request(actor.connection, "POST", `/workspaces/${workspace.id}/records`, 201, {
    source: "timer", body: null, duration_seconds: 35, recorded_at: new Date().toISOString(),
  }), K.invalidResponse);
  assert.equal(manual.source, "manual");
  assert.equal(manual.author_id, actor.session.user.id);
  assert.equal(timer.source, "timer");
  assert.equal(timer.duration_seconds, 35);
  const records = typia.assert<K.Record[]>(await K.request(actor.connection, "GET", "/users/me/records", 200), K.invalidResponse);
  assert.deepEqual(records.map((entry) => entry.id).sort((a, b) => a.localeCompare(b)), [manual.id, timer.id].sort((a, b) => a.localeCompare(b)));
  const total = typia.assert<K.Statistics>(await K.request(actor.connection, "GET", "/users/me/statistics", 200), K.invalidResponse);
  assert.equal(total.total_duration_seconds, 95);
  await K.error(actor.connection, "POST", `/workspaces/${workspace.id}/records`, 400, {
    source: "manual", body: null, duration_seconds: -1, recorded_at: new Date().toISOString(),
  });
  await K.request(actor.connection, "PATCH", "/users/me", 200, { visibility: "private" });
  await K.error(observer.connection, "GET", `/users/${actor.session.user.id}/records`, 403);
  await K.error(observer.connection, "GET", `/users/${actor.session.user.id}/statistics`, 403);
  await K.befriend(actor, observer);
  await K.request(actor.connection, "PATCH", "/users/me", 200, { visibility: "friends" });
  const visible = typia.assert<K.Statistics>(await K.request(observer.connection, "GET", `/users/${actor.session.user.id}/statistics`, 200), K.invalidResponse);
  assert.equal(visible.total_duration_seconds, 95);
}

// V1-604의 작성자 조건, V1-409, DB-FK-004: active 상태에서 타인 수정과 삭제된 부모의 쓰기를 거부합니다.
export async function test_api_knittinglog_record_authority(connection: K.Connection): Promise<void> {
  const [owner, member] = await Promise.all([K.register(connection), K.register(connection)]);
  await K.befriend(owner, member);
  const project = await K.project(owner);
  await K.join(owner, member, project.id);
  const workspace = await K.workspace(member, project.id);
  const record = await K.record(member, workspace.id);
  await K.error(owner.connection, "PATCH", `/records/${record.id}`, 403, { body: "타인 기록 변경" });
  await K.error(owner.connection, "DELETE", `/records/${record.id}`, 403);
  const changed = typia.assert<K.Record>(await K.request(member.connection, "PATCH", `/records/${record.id}`, 200, { body: "수정한 기록" }), K.invalidResponse);
  assert.equal(changed.body, "수정한 기록");
  await K.error(member.connection, "POST", `/workspaces/${randomUUID()}/records`, 404, {
    source: "manual", body: null, duration_seconds: 1, recorded_at: new Date().toISOString(),
  });
  await K.request(member.connection, "DELETE", `/records/${record.id}`, 204);
  await K.error(member.connection, "GET", `/records/${record.id}`, 404);
  const kept = await K.record(member, workspace.id);
  await K.error(member.connection, "DELETE", `/projects/${project.id}`, 403);
  await K.request(owner.connection, "DELETE", `/projects/${project.id}`, 204);
  await K.error(member.connection, "GET", `/records/${kept.id}`, 404);
  await K.error(member.connection, "POST", `/workspaces/${workspace.id}/records`, 404, {
    source: "manual", body: null, duration_seconds: 1, recorded_at: new Date().toISOString(),
  });
}

// 확정 정책 6.2: done 상태의 기존 기록 변경은 합계와 작업 공간 변경 번호에 반영합니다.
export async function test_api_knittinglog_done_record_changes(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const project = await K.project(actor);
  const workspace = await K.workspace(actor, project.id);
  const record = await K.record(actor, workspace.id, 60);
  const done = typia.assert<K.Workspace>(await K.request(actor.connection, "PATCH", `/workspaces/${workspace.id}`, 200, { status: "done" }), K.invalidResponse);
  const changed = typia.assert<K.Record>(await K.request(actor.connection, "PATCH", `/records/${record.id}`, 200, {
    body: "완료 후 수정", duration_seconds: 90,
  }), K.invalidResponse);
  assert.equal(changed.duration_seconds, 90);
  const updated = await K.workspace(actor, project.id);
  assert.equal(updated.status, "done");
  assert.equal(updated.ended_at, done.ended_at);
  assert.ok(updated.version > done.version);
  const total = typia.assert<K.Statistics>(await K.request(actor.connection, "GET", "/users/me/statistics", 200), K.invalidResponse);
  assert.equal(total.total_duration_seconds, 90);
  await K.request(actor.connection, "DELETE", `/records/${record.id}`, 204);
  const afterDelete = await K.workspace(actor, project.id);
  assert.ok(afterDelete.version > updated.version);
  const empty = typia.assert<K.Statistics>(await K.request(actor.connection, "GET", "/users/me/statistics", 200), K.invalidResponse);
  assert.equal(empty.total_duration_seconds, 0);
}

// V1-606~607: 비차단 멤버의 댓글은 작성자만 삭제하며 반응 재시도는 중복을 만들지 않습니다.
export async function test_api_knittinglog_record_interactions(connection: K.Connection): Promise<void> {
  const emoji = K.fixtureCode("KNITTINGLOG_TEST_EMOJI_CODE");
  const [owner, member] = await Promise.all([K.register(connection), K.register(connection)]);
  await K.befriend(owner, member);
  const project = await K.project(owner);
  await K.join(owner, member, project.id);
  const workspace = await K.workspace(member, project.id);
  const record = await K.record(member, workspace.id);
  const comment = typia.assert<K.Comment>(await K.request(owner.connection, "POST", `/records/${record.id}/comments`, 201, { body: "다른 멤버의 댓글" }), K.invalidResponse);
  assert.equal(comment.author_id, owner.session.user.id);
  await K.error(member.connection, "DELETE", `/record-comments/${comment.id}`, 403);
  await K.request(owner.connection, "DELETE", `/record-comments/${comment.id}`, 204);
  const comments = typia.assert<K.Comment[]>(await K.request(member.connection, "GET", `/records/${record.id}/comments`, 200), K.invalidResponse);
  assert.equal(comments.length, 0);
  const reactions = await Promise.all([0, 1].map(async () => typia.assert<K.Reaction>(
    await K.request(owner.connection, "PUT", `/records/${record.id}/reactions/${encodeURIComponent(emoji)}`, 200), K.invalidResponse,
  )));
  assert.equal(reactions[0]!.id, reactions[1]!.id);
  const active = typia.assert<K.Reaction[]>(await K.request(member.connection, "GET", `/records/${record.id}/reactions`, 200), K.invalidResponse);
  assert.equal(active.length, 1);
  assert.equal(active[0]!.user_id, owner.session.user.id);
  await K.request(owner.connection, "DELETE", `/records/${record.id}/reactions/${encodeURIComponent(emoji)}`, 204);
  const remaining = typia.assert<K.Reaction[]>(await K.request(member.connection, "GET", `/records/${record.id}/reactions`, 200), K.invalidResponse);
  assert.equal(remaining.length, 0);
  await K.error(owner.connection, "PUT", `/records/${record.id}/reactions/unknown`, 400);
}
