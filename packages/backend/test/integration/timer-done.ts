import assert from "node:assert/strict";

import { test_api_knittinglog_paused_timer_done } from "../features/api/knittinglog/test_api_knittinglog_workspaces";

test_api_knittinglog_paused_timer_done({ host: process.env.KNITTINGLOG_TEST_URL ?? "" }).then(() => {
  console.log("PASS 일시정지 타이머 종료 전 done 전환 거부");
}).catch((error: unknown) => {
  if (error instanceof assert.AssertionError && typeof error.actual === "number" && typeof error.expected === "number") {
    console.error(`FAIL HTTP actual=${error.actual} expected=${error.expected}`);
  } else console.error("FAIL 일시정지 타이머 상태 경계");
  process.exitCode = 1;
});
