import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

// 확정 정책 6.4: 일반 사용자에게 신고 증거와 운영 조치 권한을 부여하지 않습니다.
export async function test_api_knittinglog_report_operator_authority(connection: K.Connection): Promise<void> {
  const actor = await K.register(connection);
  await K.error(actor.connection, "GET", "/admin/reports", 403);
  await K.error(actor.connection, "GET", `/admin/reports/${randomUUID()}`, 403);
  await K.error(actor.connection, "POST", `/admin/reports/${randomUUID()}/actions`, 403, {
    operation_id: randomUUID(), action_code: "review", reason: "허용하지 않은 운영 조치",
  });
}

// 확정 정책 6.4: 승인한 격리 운영자만 증거 불변과 조치 이력을 검증합니다.
export async function test_api_knittinglog_report_operator_workflow(connection: K.Connection): Promise<void> {
  const token = process.env.KNITTINGLOG_TEST_OPERATOR_TOKEN;
  const operatorId = process.env.KNITTINGLOG_TEST_OPERATOR_USER_ID;
  assert.ok(token && operatorId, "FIXTURE_BLOCKED: 승인한 격리 운영자 세션이 필요합니다.");
  K.uuid(operatorId);
  const operator = { ...connection, headers: { Authorization: `Bearer ${token}` } };
  const [author, reporter] = await Promise.all([K.register(connection), K.register(connection)]);
  const post = typia.assert<K.Post>(await K.request(author.connection, "POST", "/posts", 201, { body: "신고 접수 당시 게시글" }), K.invalidResponse);
  const receipt = typia.assert<{ id: string }>(await K.request(reporter.connection, "POST", "/reports", 201, {
    post_id: post.id, reason_code: "spam", detail: "운영 조치 테스트", block_target: false,
  }), K.invalidResponse);
  const read = async (): Promise<K.Report> => typia.assert<K.Report>(await K.request(operator, "GET", `/admin/reports/${receipt.id}`, 200), K.invalidResponse);
  const initial = await read();
  assert.equal(initial.status, "received");
  assert.equal(initial.target_snapshot.body, post.body);
  assert.deepEqual(Object.keys(initial.target_snapshot).sort((a, b) => a.localeCompare(b)), ["schema_version", "author_id", "body", "source_updated_at"].sort((a, b) => a.localeCompare(b)));
  const queue = typia.assert<K.Report[]>(await K.request(operator, "GET", "/admin/reports?status=received", 200), K.invalidResponse);
  assert.ok(queue.some((entry) => entry.id === receipt.id));
  const review = { operation_id: randomUUID(), action_code: "review", reason: "내용 확인", expected_status: "received" };
  const reviewed = typia.assert<K.ReportAction>(await K.request(operator, "POST", `/admin/reports/${receipt.id}/actions`, 201, review), K.invalidResponse);
  assert.equal(reviewed.actor_user_id, operatorId);
  assert.equal(reviewed.result.status, "reviewing");
  assert.deepEqual(await K.request(operator, "POST", `/admin/reports/${receipt.id}/actions`, 201, review), reviewed);
  await K.error(operator, "POST", `/admin/reports/${receipt.id}/actions`, 409, { ...review, reason: "다른 입력" });
  await K.error(operator, "POST", `/admin/reports/${receipt.id}/actions`, 409, {
    operation_id: randomUUID(), action_code: "close", reason: "오래된 상태", expected_status: "received",
  });
  const hidden = typia.assert<K.ReportAction>(await K.request(operator, "POST", `/admin/reports/${receipt.id}/actions`, 201, {
    operation_id: randomUUID(), action_code: "hide_post", reason: "게시글 숨김", expected_status: "reviewing",
  }), K.invalidResponse);
  assert.equal(hidden.result.post_hidden, true);
  await K.error(reporter.connection, "GET", `/posts/${post.id}`, 404);
  assert.deepEqual((await read()).target_snapshot, initial.target_snapshot);
  const closed = typia.assert<K.ReportAction>(await K.request(operator, "POST", `/admin/reports/${receipt.id}/actions`, 201, {
    operation_id: randomUUID(), action_code: "close", reason: "검토 종결", expected_status: "reviewing",
  }), K.invalidResponse);
  assert.equal(closed.result.status, "closed");
  const final = await read();
  assert.equal(final.status, "closed");
  assert.deepEqual(final.actions.map((entry) => entry.id), [reviewed.id, hidden.id, closed.id]);
  assert.deepEqual(final.target_snapshot, initial.target_snapshot);
  await K.error(reporter.connection, "PATCH", `/admin/reports/${receipt.id}`, 404, { target_snapshot: {} });
}
