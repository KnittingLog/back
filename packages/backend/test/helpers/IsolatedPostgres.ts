import assert from "node:assert/strict";

export function assertIsolatedPostgresUrl(value: string, expectedPort = "50799"): void {
  assert.ok(["50799", "50801"].includes(expectedPort));
  const target = new URL(value);
  assert.ok(target.protocol === "postgresql:" || target.protocol === "postgres:");
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.port, expectedPort);
  assert.equal(target.pathname, "/knittinglog_tdd");
  // pg는 URL 쿼리로 접속 대상을 바꿀 수 있습니다. 실제 연결 전에 모두 거부합니다.
  assert.equal(target.search, "");
  assert.equal(target.hash, "");
}
