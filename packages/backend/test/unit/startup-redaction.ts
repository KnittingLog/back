import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// 빈 임시 폴더에서 실행하므로 실제 .env와 DB를 읽지 않습니다.
const sentinel = "knittinglog_test_do_not_log_this_value";
const run = spawnSync(process.execPath, [path.resolve(__dirname, "../../lib/executable/server.js")], {
  cwd: mkdtempSync(path.join(os.tmpdir(), "knittinglog-startup-test-")),
  env: { PATH: process.env.PATH, MODE: "local", API_PORT: sentinel, SYSTEM_PASSWORD: sentinel,
    POSTGRES_URL: "postgresql://127.0.0.1:1/unused", POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "1",
    POSTGRES_DATABASE: "unused", POSTGRES_SCHEMA: "accounts", POSTGRES_USERNAME: "unused",
    POSTGRES_USERNAME_READONLY: "unused", POSTGRES_PASSWORD: sentinel },
  timeout: 15_000, encoding: "utf8",
});
try {
  assert.ok(run.status !== 0 && run.status !== null);
  assert.ok(!(run.stdout + run.stderr).includes(sentinel));
  console.log("PASS 시작 실패의 환경값 비노출");
} catch {
  console.error("FAIL 시작 실패의 환경값 비노출");
  process.exitCode = 1;
}
