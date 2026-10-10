import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

// V1-901, DB-DS-005: 신고는 한 대상을 지정하며 선택한 차단만 함께 처리합니다.
export async function test_api_knittinglog_report_target(connection: K.Connection): Promise<void> {
  const reason = K.fixtureCode("KNITTINGLOG_TEST_REPORT_REASON_CODE");
  const [reporter, target] = await Promise.all([K.register(connection), K.register(connection)]);
  const input = { reason_code: reason, detail: "테스트 신고", block_target: false };
  await K.error(reporter.connection, "POST", "/reports", 400, input);
  await K.error(reporter.connection, "POST", "/reports", 400, {
    ...input, target_user_id: target.session.user.id, post_id: randomUUID(), block_target: true,
  });
  K.publicProfile(await K.request(reporter.connection, "GET", `/users/${target.session.user.id}`, 200));
  await K.error(reporter.connection, "POST", "/reports", 400, { ...input, reason_code: "unknown", target_user_id: target.session.user.id });
  await K.error(reporter.connection, "POST", "/reports", 400, { ...input, reason_code: "other", detail: "", target_user_id: target.session.user.id });
  const receipt = typia.assert<{
    id: string;
    reporter_id: string;
    target_user_id: string | null;
    post_id: string | null;
  }>(await K.request(reporter.connection, "POST", "/reports", 201, {
    ...input, target_user_id: target.session.user.id, block_target: true,
  }), K.invalidResponse);
  K.uuid(receipt.id);
  assert.equal(receipt.reporter_id, reporter.session.user.id);
  assert.equal(receipt.target_user_id, target.session.user.id);
  assert.equal(receipt.post_id, null);
  await K.error(reporter.connection, "GET", `/users/${target.session.user.id}`, 404);
}
