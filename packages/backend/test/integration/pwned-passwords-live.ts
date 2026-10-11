import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Security } from "../../src/providers/auth/Security";

async function main(): Promise<void> {
  assert.equal(process.env.KNITTINGLOG_TEST_LIVE_PASSWORDS, "1", "합성 비밀번호의 외부 제공자 검사가 필요합니다.");
  // 공개된 검사 문자열과 새 합성 문자열만 사용합니다. 사용자 비밀번호를 읽지 않습니다.
  assert.equal(await Security.pwnedPassword("password"), "breached");
  const synthetic = `Qa!${randomUUID()}aA1`;
  assert.equal(await Security.screenPassword(synthetic, true), synthetic);
  console.log("PASS 실제 유출 비밀번호 제공자의 공개 문자열 거부·합성 문자열 허용");
}

main().catch(() => {
  console.error("FAIL 실제 유출 비밀번호 제공자 검사; 인증값·해시·접속 응답은 출력하지 않습니다.");
  process.exitCode = 1;
});
