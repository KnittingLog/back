import { HttpException } from "@nestjs/common";
import assert from "node:assert/strict";

import * as AuthAttemptProvider from "../../src/providers/auth/AuthAttemptProvider";

interface Window {
  count: number;
  expiresAt: number;
}

class TransactionalStub implements AuthAttemptProvider.Store {
  public constructor(
    private readonly rows: Map<string, Window>,
    private readonly now: () => number,
  ) {}

  public async consume(key: string): Promise<number> {
    const now = this.now();
    const current = this.rows.get(key);
    const next = !current || current.expiresAt <= now
      ? { count: 1, expiresAt: now + 600_000 }
      : { count: Math.min(current.count + 1, 11), expiresAt: current.expiresAt };
    this.rows.set(key, next);
    return next.count;
  }
}

async function main(): Promise<void> {
  let now = 1_000;
  const rows = new Map<string, Window>();
  const first = AuthAttemptProvider.createLimiter(new TransactionalStub(rows, () => now));
  const second = AuthAttemptProvider.createLimiter(new TransactionalStub(rows, () => now));
  const identifier = "  User.Name_1  ";
  assert.equal(
    AuthAttemptProvider.key("login", identifier),
    AuthAttemptProvider.key("login", "user.name_1"),
  );
  assert.equal(AuthAttemptProvider.key("login", identifier).length, 64);
  assert.ok(!rows.has(identifier));

  const attempts = await Promise.allSettled(
    Array.from({ length: 16 }, (_, index) => (index % 2 ? first : second).attempt("login", identifier)),
  );
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 10);
  const denied = attempts.find((result) => result.status === "rejected");
  assert.ok(denied && denied.status === "rejected");
  assert.ok(denied.reason instanceof HttpException);
  assert.equal(denied.reason.getStatus(), 429);
  assert.equal(rows.size, 1, "서로 다른 제한기 인스턴스가 같은 해시 키를 공유해야 합니다.");
  assert.ok(![...rows.keys()].some((storedKey) => storedKey.includes(identifier.trim())));

  now += 600_000;
  await second.attempt("login", identifier);
  assert.equal(rows.get(AuthAttemptProvider.key("login", identifier))?.count, 1);

  let principalActive = true;
  let principalChecks = 0;
  let guardedCount = 0;
  const guarded = AuthAttemptProvider.createLimiter({
    async consume(): Promise<number> {
      principalChecks++;
      if (!principalActive) throw new Error("system principal revoked");
      return ++guardedCount;
    },
  });
  await guarded.attempt("login", identifier);
  principalActive = false;
  await assert.rejects(guarded.attempt("login", identifier), (error: unknown) =>
    error instanceof HttpException && error.getStatus() === 503);
  assert.equal(principalChecks, 2, "시스템 주체를 매 시도 다시 확인해야 합니다.");
  assert.equal(guardedCount, 1, "폐기된 주체로 시도를 소비하지 않아야 합니다.");

  const unavailable = AuthAttemptProvider.createLimiter({
    async consume(): Promise<number> {
      throw new Error("store unavailable");
    },
  });
  await assert.rejects(unavailable.attempt("login", identifier), (error: unknown) =>
    error instanceof HttpException && error.getStatus() === 503 &&
      JSON.stringify(error.getResponse()).includes("AUTH_RATE_LIMIT_UNAVAILABLE"));
  console.log("PASS shared attempt window, normalization, expiry, revoked principal and fail-closed storage");
}

main().catch(() => {
  console.error("FAIL distributed authentication attempt limiter");
  process.exitCode = 1;
});
