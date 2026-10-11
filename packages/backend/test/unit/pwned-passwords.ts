import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { Security } from "../../src/providers/auth/Security";

async function main(): Promise<void> {
  const password = " 검사 전용 Unicode 비밀번호  ";
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const suffix = hash.slice(5);
  const other = "A".repeat(35);
  assert.notEqual(suffix, other);
  const response = (body: string, status = 200): typeof fetch => async (url, options) => {
    assert.equal(String(url), `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    assert.equal(options?.redirect, "error");
    assert.equal(options?.body, undefined);
    assert.equal(new Headers(options?.headers).get("add-padding"), "true");
    assert.ok(options?.signal instanceof AbortSignal);
    assert.ok(!JSON.stringify(options).includes(password));
    return new Response(body, { status });
  };
  assert.equal(await Security.pwnedPassword(password, response(`${suffix}:12\r\n${other}:0\r\n`)), "breached");
  assert.equal(await Security.pwnedPassword(password, response(`${suffix}:0\r\n${other}:1\r\n`)), "safe");
  assert.equal(await Security.pwnedPassword(password, response(`${other}:1\n`)), "safe");
  for (const body of ["", " ", "<html>장애</html>", `${suffix}:NaN`, `${suffix}:-1`, `${suffix}:1\ninvalid`, `${suffix.slice(1)}:2`, `${suffix}:9007199254740992`, `${other}:1 `, `${other}:1\n\n`]) {
    assert.equal(await Security.pwnedPassword(password, response(body)), "unavailable");
  }
  for (const status of [301, 404, 429, 500, 503]) {
    assert.equal(await Security.pwnedPassword(password, response(`${other}:1`, status)), "unavailable");
  }
  const throws: typeof fetch = async () => { throw new Error("검사 전용 통신 장애"); };
  assert.equal(await Security.pwnedPassword(password, throws), "unavailable");
  const absent: typeof fetch = async () => new Response(null);
  assert.equal(await Security.pwnedPassword(password, absent), "unavailable");
  let cancelled = false;
  const oversized: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); },
    cancel() { cancelled = true; },
  }));
  assert.equal(await Security.pwnedPassword(password, oversized), "unavailable");
  assert.equal(cancelled, true);
  const broken: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) { controller.error(new Error("검사 전용 본문 오류")); },
  }));
  assert.equal(await Security.pwnedPassword(password, broken), "unavailable");
  await assert.rejects(Security.screenPassword(password, true, (value) => Security.pwnedPassword(value, response("invalid"))), Security.ScreeningUnavailable);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = response(`${suffix}:1`);
    await assert.rejects(Security.screenPassword(password, true), (error: unknown) =>
      error instanceof Error && !(error instanceof Security.ScreeningUnavailable));
    globalThis.fetch = response("invalid");
    await assert.rejects(Security.screenPassword(password, true), Security.ScreeningUnavailable);
    globalThis.fetch = response(`${other}:1`);
    assert.equal(await Security.screenPassword(password, true), password);
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error("오프라인 검사"); };
    assert.equal(await Security.screenPassword(password, false), password);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
  const timeout: typeof fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(new Error("검사 전용 시간 초과")), { once: true });
  });
  // 테스트 전송 함수의 대기 중에도 프로세스가 종료되지 않게 유지합니다.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    assert.equal(await Security.pwnedPassword(password, timeout), "unavailable");
  } finally {
    clearInterval(keepAlive);
  }
  console.log("PASS 유출 비밀번호 범위 조회·원문 비전송·패딩·응답 한도·오류 시 차단");
}

main().catch(() => {
  console.error("FAIL 유출 비밀번호 제공자 계약");
  process.exitCode = 1;
});
