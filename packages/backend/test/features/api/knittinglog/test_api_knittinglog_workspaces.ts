import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

/**
 * V1-408, DB-DS-001: 작업 상태와 종료 시각은 일치하며 완료 상태는 새 작업을 거부합니다.
 * @evidence docs/requirements.md#상태-전이 상태 전환과 ended_at, 완료 상태의 신규 작업 거부를 검증한다.
 */
export async function test_api_knittinglog_workspace_state(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const project = await K.project(actor);
  let workspace = await K.workspace(actor, project.id);
  const counter = (await K.counters(actor, workspace.id))[0]!;
  for (const status of ["paused", "active", "done", "paused", "done", "active"] as const) {
    const previousVersion = workspace.version;
    workspace = typia.assert<K.Workspace>(await K.request(actor.connection, "PATCH", `/workspaces/${workspace.id}`, 200, { status }), K.invalidResponse);
    assert.equal(workspace.status, status);
    assert.ok(workspace.version > previousVersion, "상태 변경은 변경 번호를 증가시킵니다.");
    if (status === "done") {
      assert.ok(workspace.ended_at !== null && Number.isFinite(Date.parse(workspace.ended_at)));
      await K.error(actor.connection, "POST", `/counters/${counter.id}/adjust`, 409, { delta: 1, operation_id: randomUUID() });
      await K.error(actor.connection, "POST", `/workspaces/${workspace.id}/records`, 409, {
        source: "manual", body: null, duration_seconds: 60, recorded_at: new Date().toISOString(),
      });
      const unchanged = (await K.counters(actor, workspace.id)).find((entry) => entry.id === counter.id)!;
      assert.equal(unchanged.value, 0);
    } else assert.equal(workspace.ended_at, null);
  }
  const projectMemberships = typia.assert<K.Membership[]>(await K.request(actor.connection, "GET", `/projects/${project.id}/memberships`, 200), K.invalidResponse);
  assert.equal(projectMemberships[0]!.left_at, null, "작업 완료는 참여 종료가 아닙니다.");
}

// V1-703, V1-705, V1-707: 카운터는 음수를 거부하며 동시 증가를 잃지 않습니다.
export async function test_api_knittinglog_counter_integrity(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const project = await K.project(actor);
  const workspace = await K.workspace(actor, project.id);
  const counter = (await K.counters(actor, workspace.id))[0]!;
  await K.error(actor.connection, "POST", `/counters/${counter.id}/adjust`, 409, { delta: -1, operation_id: randomUUID() });
  await K.error(actor.connection, "PATCH", `/counters/${counter.id}`, 400, { value: -1, operation_id: randomUUID(), expected_version: workspace.version });
  await K.request(actor.connection, "PATCH", `/counters/${counter.id}`, 200, { name: "테스트 카운터", target_value: 1, operation_id: randomUUID(), expected_version: workspace.version });
  const operation_id = randomUUID();
  const replayed = await Promise.all([0, 1].map(() => K.request(actor.connection, "POST", `/counters/${counter.id}/adjust`, 200, { delta: 1, operation_id })));
  assert.deepEqual(replayed[0], replayed[1], "같은 명령은 같은 결과를 반환합니다.");
  await K.error(actor.connection, "POST", `/counters/${counter.id}/adjust`, 409, { delta: -1, operation_id });
  await Promise.all(Array.from({ length: 7 }, () => K.request(actor.connection, "POST", `/counters/${counter.id}/adjust`, 200, { delta: 1, operation_id: randomUUID() })));
  const current = (await K.counters(actor, workspace.id)).find((entry) => entry.id === counter.id)!;
  assert.equal(current.value, 8);
  assert.equal(current.target_value, 1, "목표 초과는 허용합니다.");
  await K.error(actor.connection, "POST", `/counters/${counter.id}/reset`, 409, { operation_id: randomUUID(), expected_version: workspace.version });
  const beforeReset = await K.workspace(actor, project.id);
  const resetPayload = { operation_id: randomUUID(), expected_version: beforeReset.version };
  const firstReset = await K.request(actor.connection, "POST", `/counters/${counter.id}/reset`, 200, resetPayload);
  assert.deepEqual(await K.request(actor.connection, "POST", `/counters/${counter.id}/reset`, 200, resetPayload), firstReset);
  const reset = (await K.counters(actor, workspace.id)).find((entry) => entry.id === counter.id)!;
  assert.equal(reset.value, 0);
  assert.equal(reset.target_value, 1);
  const updated = await K.workspace(actor, project.id);
  assert.ok(updated.version > workspace.version, "카운터 변경도 작업 공간 변경 번호에 반영합니다.");
}

// V1-407, DB-FK-004: 같은 프로젝트의 다른 멤버도 개인 설정과 카운터를 변경할 수 없습니다.
export async function test_api_knittinglog_workspace_ownership(connection: K.Connection): Promise<void> {
  const [owner, member] = await Promise.all([K.register(connection), K.register(connection)]);
  await K.befriend(owner, member);
  const project = await K.project(owner);
  await K.join(owner, member, project.id);
  const workspace = await K.workspace(member, project.id);
  const counter = (await K.counters(member, workspace.id))[0]!;
  await K.error(owner.connection, "PATCH", `/workspaces/${workspace.id}`, 403, { yarn_notes: "타인 설정" });
  await K.error(owner.connection, "POST", `/counters/${counter.id}/adjust`, 403, { delta: 1, operation_id: randomUUID() });
  const changed = typia.assert<K.Workspace>(await K.request(member.connection, "PATCH", `/workspaces/${workspace.id}`, 200, {
    yarn_notes: "면사", needle_notes: "4 mm", status: "paused",
  }), K.invalidResponse);
  assert.equal(changed.yarn_notes, "면사");
  assert.equal(changed.needle_notes, "4 mm");
  const filtered = typia.assert<K.Project[]>(await K.request(member.connection, "GET", "/projects?status=paused", 200), K.invalidResponse);
  assert.ok(filtered.some((entry) => entry.id === project.id));
  const otherStatus = typia.assert<K.Project[]>(await K.request(member.connection, "GET", "/projects?status=active", 200), K.invalidResponse);
  assert.ok(!otherStatus.some((entry) => entry.id === project.id));
}

// V1-704·706: 카운터의 생성·삭제·표시 순서 변경은 현재 변경 번호를 확인합니다.
export async function test_api_knittinglog_counter_collection(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const project = await K.project(actor);
  const workspace = await K.workspace(actor, project.id);
  const defaults = await K.counters(actor, workspace.id);
  const input = { operation_id: randomUUID(), expected_version: workspace.version, name: "추가 카운터", target_value: null, is_visible: true };
  const created = typia.assert<K.Counter>(await K.request(actor.connection, "POST", `/workspaces/${workspace.id}/counters`, 201, input), K.invalidResponse);
  const current = await K.workspace(actor, project.id);
  const orderedIds = [created.id, ...defaults.map((entry) => entry.id)];
  await K.error(actor.connection, "PATCH", `/workspaces/${workspace.id}/counters/order`, 409, {
    operation_id: randomUUID(), expected_version: workspace.version, counter_ids: orderedIds,
  });
  await K.request(actor.connection, "PATCH", `/workspaces/${workspace.id}/counters/order`, 200, {
    operation_id: randomUUID(), expected_version: current.version, counter_ids: orderedIds,
  });
  const ordered = await K.counters(actor, workspace.id);
  assert.deepEqual(ordered.map((entry) => entry.id), orderedIds);
  const beforeVisibility = await K.workspace(actor, project.id);
  await K.request(actor.connection, "PATCH", `/counters/${created.id}`, 200, {
    operation_id: randomUUID(), expected_version: beforeVisibility.version, is_visible: false,
  });
  assert.equal((await K.counters(actor, workspace.id)).find((entry) => entry.id === created.id)!.is_visible, false);
  const beforeDelete = await K.workspace(actor, project.id);
  await K.request(actor.connection, "DELETE", `/counters/${created.id}`, 204, {
    operation_id: randomUUID(), expected_version: beforeDelete.version,
  });
  const remaining = await K.counters(actor, workspace.id);
  assert.deepEqual(remaining.map((entry) => entry.id), defaults.map((entry) => entry.id), "기본 카운터를 다시 생성하지 않습니다.");
}

// V1-701~702: 서버 타이머는 다른 기기에서 이어하며 종료와 기록 저장을 멱등 처리합니다.
export async function test_api_knittinglog_server_timer(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const project = await K.project(actor);
  let workspace = await K.workspace(actor, project.id);
  const prefix = `/workspaces/${workspace.id}/timer`;
  const start = { operation_id: randomUUID(), expected_version: workspace.version };
  const running = typia.assert<K.Timer>(await K.request(actor.connection, "POST", `${prefix}/start`, 201, start), K.invalidResponse);
  assert.equal(running.status, "running");
  assert.equal(running.owner_user_id, actor.session.user.id);
  workspace = await K.workspace(actor, project.id);
  await K.error(actor.connection, "POST", `${prefix}/start`, 409, { operation_id: randomUUID(), expected_version: workspace.version });
  await K.error(actor.connection, "PATCH", `/workspaces/${workspace.id}`, 409, { status: "done" });
  const otherSession = typia.assert<K.Session>(await K.request(connection, "POST", "/auth/login", 200, { login_id: actor.input.login_id, password: actor.input.password }), K.invalidResponse);
  const otherDevice = { ...connection, headers: { Authorization: `Bearer ${otherSession.access_token}` } };
  const resumedState = typia.assert<K.Timer>(await K.request(otherDevice, "GET", prefix, 200), K.invalidResponse);
  assert.equal(resumedState.id, running.id);
  await K.error(otherDevice, "POST", `${prefix}/pause`, 409, { operation_id: randomUUID(), expected_version: start.expected_version });
  const paused = typia.assert<K.Timer>(await K.request(otherDevice, "POST", `${prefix}/pause`, 200, {
    operation_id: randomUUID(), expected_version: workspace.version,
  }), K.invalidResponse);
  assert.equal(paused.status, "paused");
  assert.ok(paused.accumulated_seconds >= 0);
  workspace = await K.workspace(actor, project.id);
  const resumed = typia.assert<K.Timer>(await K.request(actor.connection, "POST", `${prefix}/resume`, 200, {
    operation_id: randomUUID(), expected_version: workspace.version,
  }), K.invalidResponse);
  assert.equal(resumed.id, running.id);
  assert.equal(resumed.status, "running");
  workspace = await K.workspace(actor, project.id);
  const stop = { operation_id: randomUUID(), expected_version: workspace.version, body: "타이머 완료" };
  const record = typia.assert<K.Record>(await K.request(otherDevice, "POST", `${prefix}/stop`, 201, stop), K.invalidResponse);
  assert.equal(record.source, "timer");
  assert.equal(record.workspace_id, workspace.id);
  assert.ok(record.duration_seconds >= paused.accumulated_seconds);
  const replay = typia.assert<K.Record>(await K.request(actor.connection, "POST", `${prefix}/stop`, 201, stop), K.invalidResponse);
  assert.equal(replay.id, record.id);
  const records = typia.assert<K.Record[]>(await K.request(actor.connection, "GET", `/workspaces/${workspace.id}/records`, 200), K.invalidResponse);
  assert.equal(records.filter((entry) => entry.id === record.id).length, 1);
  await K.request(actor.connection, "PATCH", `/workspaces/${workspace.id}`, 200, { status: "done" });
}

// 확정 정책 6.2: 일시정지한 미완료 타이머를 남긴 채 done으로 전환하지 않습니다.
export async function test_api_knittinglog_paused_timer_done(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  const project = await K.project(actor);
  let workspace = await K.workspace(actor, project.id);
  const prefix = `/workspaces/${workspace.id}/timer`;
  const running = typia.assert<K.Timer>(await K.request(actor.connection, "POST", `${prefix}/start`, 201, {
    operation_id: randomUUID(), expected_version: workspace.version,
  }), K.invalidResponse);
  workspace = await K.workspace(actor, project.id);
  await K.request(actor.connection, "POST", `${prefix}/pause`, 200, { operation_id: randomUUID(), expected_version: workspace.version });
  const pausedWorkspace = await K.workspace(actor, project.id);
  await K.error(actor.connection, "PATCH", `/workspaces/${workspace.id}`, 409, { status: "done" });
  const kept = await K.workspace(actor, project.id);
  assert.equal(kept.version, pausedWorkspace.version, "거부된 완료 전환은 상태를 변경하지 않습니다.");
  const paused = typia.assert<K.Timer>(await K.request(actor.connection, "GET", prefix, 200), K.invalidResponse);
  assert.equal(paused.id, running.id);
  assert.equal(paused.status, "paused");
  await K.request(actor.connection, "POST", `${prefix}/stop`, 201, {
    operation_id: randomUUID(), expected_version: kept.version, body: null,
  });
  const done = typia.assert<K.Workspace>(await K.request(actor.connection, "PATCH", `/workspaces/${workspace.id}`, 200, { status: "done" }), K.invalidResponse);
  assert.equal(done.status, "done");
}
