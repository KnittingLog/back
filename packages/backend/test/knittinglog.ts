import { DynamicExecutor } from "@nestia/e2e";
import assert from "node:assert/strict";
import path from "node:path";

import { KnittingLogApi } from "./helpers/KnittingLogApi";

// 기존 테스트의 DB 초기화와 서버 시작 경로를 사용하지 않습니다.
async function main(): Promise<void> {
  const host = process.env.KNITTINGLOG_TEST_URL;
  assert.ok(host, "격리된 로컬 API의 KNITTINGLOG_TEST_URL이 필요합니다.");
  const connection: KnittingLogApi.Connection = { host };
  KnittingLogApi.assertLocal(connection);
  const report = await DynamicExecutor.validate({
    prefix: "test_api_knittinglog_",
    location: path.join(__dirname, "features/api/knittinglog"),
    parameters: () => [connection] as const,
    simultaneous: 1,
    extension: __filename.endsWith(".ts") ? "ts" : "js",
    onComplete: (execution) => {
      const blocked = execution.error instanceof Error && execution.error.message.startsWith("FIXTURE_BLOCKED:");
      console.log(`${execution.error === null ? "PASS" : blocked ? "BLOCKED" : "FAIL"} ${execution.name}`);
    },
  });
  assert.ok(report.executions.length > 0, "실행한 테스트가 없습니다.");
  const failures = report.executions.filter((execution) => execution.error !== null);
  for (const failure of failures) {
    // 응답 객체와 인증값을 포함할 수 있는 오류 객체는 출력하지 않습니다.
    const blocked = failure.error instanceof Error && failure.error.message.startsWith("FIXTURE_BLOCKED:");
    console.error(`${failure.name}: ${blocked ? "정책 문서 선행 데이터를 확인하세요." : "실패했습니다. 요청 계약과 서버 구현을 확인하세요."}`);
  }
  console.log(`전체 ${report.executions.length}개, 실패 ${failures.length}개`);
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch(() => {
  console.error("테스트 실행 조건을 충족하지 못했습니다. 로컬 URL과 쓰기 동의를 확인하세요.");
  process.exitCode = 1;
});
