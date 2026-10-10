import { DynamicExecutor } from "@nestia/e2e";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import api from "@knittinglog/api";

import { MyBackend } from "../src/MyBackend";
import { MyGlobal } from "../src/MyGlobal";
import { MyModule } from "../src/MyModule";
import { MonitorHealthController } from "../src/controllers/monitors/MonitorHealthController";
import { KnittingLogApi as K } from "./helpers/KnittingLogApi";
import { assertIsolatedPostgresUrl } from "./helpers/IsolatedPostgres";

@Module({ controllers: [MonitorHealthController] })
class BaselineModule {}

async function main(): Promise<void> {
  const baseline = process.argv.includes("--baseline");
  assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1");
  assert.equal(process.env.MODE, "local");
  if (!baseline) {
    assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "");
    const [identity] = await MyGlobal.prisma.$queryRaw<{ directory: string }[]>`SELECT current_setting('data_directory') AS directory`;
    assert.ok(identity?.directory.startsWith("/private/tmp/knittinglog-tdd."));
  }
  const app = await NestFactory.create(baseline ? BaselineModule : MyModule, { logger: false });
  try {
    MyBackend.configure(app);
    await app.listen(0, "127.0.0.1");
    const connection: K.Connection = { host: await app.getUrl() };
    if (!baseline) {
      await api.functional.monitors.health.get(connection);
      const sdkPolicies = await api.functional.api.v1.policy_documents.list(connection);
      assert.ok(sdkPolicies.length > 0);
      await assert.rejects(api.functional.api.v1.users.me.me(connection), (error: unknown) =>
        error instanceof Error && "status" in error && error.status === 401);
      console.log("PASS 생성 SDK의 정책·모니터·인증 경계 HTTP 호출");
      // 운영자 인증값은 프로세스 메모리에만 보관하고 로그·파일·명령 인자로 전달하지 않습니다.
      const policies = await K.request(connection, "GET", "/policy-documents", 200) as K.Policy[];
      const suffix = randomUUID().replaceAll("-", "").slice(0, 24);
      const registration = await K.request(connection, "POST", "/auth/register", 201, {
        login_id: `qa_${suffix}`, handle: `qa_${suffix}`, nickname: "격리 테스트 운영자",
        password: `Local!${randomUUID()}aA1`, policy_document_ids: policies.map((row) => row.id),
      }) as K.Session;
      process.env.KNITTINGLOG_OPERATOR_USER_IDS = registration.user.id;
      process.env.KNITTINGLOG_TEST_OPERATOR_USER_ID = registration.user.id;
      process.env.KNITTINGLOG_TEST_OPERATOR_TOKEN = registration.access_token;
    } else {
      delete process.env.KNITTINGLOG_TEST_OPERATOR_TOKEN;
      delete process.env.KNITTINGLOG_TEST_OPERATOR_USER_ID;
      delete process.env.KNITTINGLOG_OPERATOR_USER_IDS;
    }
    process.env.KNITTINGLOG_TEST_EMOJI_CODE = "like";
    process.env.KNITTINGLOG_TEST_REPORT_REASON_CODE = "spam";
    const report = await DynamicExecutor.validate({
      prefix: "test_api_knittinglog_", location: path.join(__dirname, "features/api/knittinglog"),
      parameters: () => [connection] as const, simultaneous: 1,
      extension: __filename.endsWith(".ts") ? "ts" : "js",
      onComplete: (execution) => {
        const error = execution.error;
        const blocked = error instanceof Error && error.message.startsWith("FIXTURE_BLOCKED:");
        let detail = "";
        if (error instanceof assert.AssertionError && typeof error.actual === "number" && typeof error.expected === "number")
          detail = ` actual=${error.actual} expected=${error.expected}`;
        console.log(`${error === null ? "PASS" : blocked ? "BLOCKED" : "FAIL"} ${execution.name}${detail}`);
      },
    });
    assert.ok(report.executions.length > 0);
    const failed = report.executions.filter((row) => row.error !== null);
    const blocked = failed.filter((row) => row.error instanceof Error && row.error.message.startsWith("FIXTURE_BLOCKED:"));
    console.log(`전체 ${report.executions.length}개, 실패 ${failed.length - blocked.length}개, BLOCKED ${blocked.length}개`);
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    delete process.env.KNITTINGLOG_TEST_OPERATOR_TOKEN;
    delete process.env.KNITTINGLOG_TEST_OPERATOR_USER_ID;
    delete process.env.KNITTINGLOG_OPERATOR_USER_IDS;
    await app.close();
    if (!baseline) await MyGlobal.prisma.$disconnect();
  }
}

main().catch(() => {
  console.error("격리 테스트의 실행 조건 또는 선행 데이터를 확인하세요.");
  process.exitCode = 1;
});
