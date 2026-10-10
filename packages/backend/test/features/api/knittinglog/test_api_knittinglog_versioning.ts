import assert from "node:assert/strict";
import typia from "typia";

import { KnittingLogApi as K } from "../../../helpers/KnittingLogApi";

// API-VER-001~005: 업무 경로는 v1에서만 제공하며 운영 모니터는 버전에서 제외합니다.
export async function test_api_knittinglog_versioning(connection: K.Connection): Promise<void> {
  typia.assert<K.Policy[]>(await K.request(connection, "GET", "/policy-documents", 200), K.invalidResponse);
  for (const route of ["/policy-documents", "/api/policy-documents", "/api/v2/policy-documents", "/api/v0/policy-documents", "/api/v1/monitors/health"]) {
    const response = await K.outcome(connection, "GET", route, undefined, false);
    assert.equal(response.status, 404, "업무 버전을 자동 선택하거나 모니터 경로를 복제하지 않습니다.");
  }
  const health = await K.outcome(connection, "GET", "/monitors/health", undefined, false);
  assert.equal(health.status, 200, "기존 운영 모니터 경로를 유지합니다.");
}
