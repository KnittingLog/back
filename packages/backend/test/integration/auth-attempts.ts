import { PrismaPg } from "@prisma/adapter-pg";
import { HttpException } from "@nestjs/common";
import { PrismaClient } from "@prisma/sdk";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MyGlobal } from "../../src/MyGlobal";
import * as AuthAttemptProvider from "../../src/providers/auth/AuthAttemptProvider";
import { AuthProvider } from "../../src/providers/auth/AuthProvider";
import { Security } from "../../src/providers/auth/Security";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";

const auditPrincipal = "00000000-0000-4000-8000-000000000001";
const throttlePrincipal = "00000000-0000-4000-8000-000000000101";
let stage = "격리 대상 확인";

function authError(error: unknown): { status: number; response: unknown } {
  assert.ok(error instanceof HttpException);
  return { status: error.getStatus(), response: error.getResponse() };
}

async function main(): Promise<void> {
  assert.equal(process.env.MODE, "local");
  assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1");
  assert.equal(process.env.KNITTINGLOG_TEST_POSTGRES_PORT, "50801");
  assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "", "50801");
  const expected = process.env.KNITTINGLOG_TEST_DATA_DIRECTORY;
  assert.ok(expected && /^\/private\/tmp\/knittinglog-tdd\.[^/]+\/postgres$/.test(expected));

  let second: PrismaClient | undefined;
  let functionCreated = false;
  let triggerCreated = false;
  let principalRevoked = false;
  const identifier = `qa${randomUUID().replaceAll("-", "").slice(0, 28)}`;
  const loginKey = AuthAttemptProvider.key("login", identifier);
  const staleIdentifier = `qa${randomUUID().replaceAll("-", "").slice(0, 28)}`;
  const staleKey = AuthAttemptProvider.key("login", staleIdentifier);
  const revokedIdentifier = `qa${randomUUID().replaceAll("-", "").slice(0, 28)}`;
  const revokedKey = AuthAttemptProvider.key("login", revokedIdentifier);
  const userId = randomUUID();
  const userLogin = `qa${randomUUID().replaceAll("-", "").slice(0, 28)}`;
  const userHandle = `qa${randomUUID().replaceAll("-", "").slice(0, 28)}`;
  const knownKey = AuthAttemptProvider.key("login", userLogin);
  const unknownLogin = `qa${randomUUID().replaceAll("-", "").slice(0, 28)}`;
  const unknownKey = AuthAttemptProvider.key("login", unknownLogin);
  const wrongPassword = "wrong test password";
  const validPassword = "isolated auth attempt test password";

  try {
    const [identity] = await MyGlobal.prisma.$queryRaw<{
      directory: string;
      port: number;
      address: string;
      database: string;
    }[]>`
      SELECT current_setting('data_directory') AS directory,
        inet_server_port() AS port, host(inet_server_addr()) AS address,
        current_database() AS database`;
    assert.deepEqual(identity, {
      directory: expected,
      port: 50801,
      address: "127.0.0.1",
      database: "knittinglog_tdd",
    });

    second = new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: MyGlobal.postgresConnectionString(
            process.env.POSTGRES_URL!,
          ),
        },
        { schema: process.env.POSTGRES_SCHEMA ?? "accounts" },
      ),
    });
    const one = AuthAttemptProvider.createLimiter(
      AuthAttemptProvider.createDatabaseStore(MyGlobal.prisma),
    );
    const two = AuthAttemptProvider.createLimiter(
      AuthAttemptProvider.createDatabaseStore(second),
    );

    stage = "독립 Prisma 클라이언트 동시 요청";
    await MyGlobal.prisma.$executeRaw`
      DELETE FROM accounts.auth_attempt_limits WHERE attempt_key = ${loginKey}`;
    const concurrent = await Promise.allSettled(
      Array.from({ length: 16 }, (_, index) =>
        (index % 2 ? one : two).attempt("login", identifier)),
    );
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 10);
    const denied = concurrent.filter((result) => result.status === "rejected");
    assert.equal(denied.length, 6);
    for (const result of denied) {
      assert.ok(result.status === "rejected");
      assert.equal(authError(result.reason).status, 429);
    }
    const counts = await second.$queryRaw<{ attempt_count: number }[]>`
      SELECT attempt_count FROM accounts.auth_attempt_limits WHERE attempt_key = ${loginKey}`;
    assert.equal(counts[0]?.attempt_count, 11);

    stage = "성공 후 감사 주체 폐기 거부";
    await second.$executeRaw`
      UPDATE accounts.system_principals SET deleted_at = clock_timestamp()
      WHERE id = ${throttlePrincipal}::uuid AND code = 'auth_attempt_limiter'`;
    principalRevoked = true;
    await assert.rejects(
      one.attempt("login", revokedIdentifier),
      (error: unknown) => authError(error).status === 503,
    );
    const revokedRows = await second.$queryRaw<{ attempt_key: string }[]>`
      SELECT attempt_key FROM accounts.auth_attempt_limits WHERE attempt_key = ${revokedKey}`;
    assert.equal(revokedRows.length, 0, "폐기된 시스템 주체는 제한 횟수를 저장할 수 없어야 합니다.");
    await second.$executeRaw`
      UPDATE accounts.system_principals SET deleted_at = NULL
      WHERE id = ${throttlePrincipal}::uuid AND code = 'auth_attempt_limiter'`;
    principalRevoked = false;

    stage = "20분 초과 만료 키의 복수 클라이언트 동시 재설정";
    await second.$executeRaw`
      INSERT INTO accounts.auth_attempt_limits (
        id, attempt_key, attempt_count, window_started_at, expires_at,
        created_by, updated_by
      ) VALUES (
        gen_random_uuid(), ${staleKey}, 7,
        clock_timestamp() - interval '31 minutes',
        clock_timestamp() - interval '21 minutes 30 seconds',
        ${throttlePrincipal}::uuid, ${throttlePrincipal}::uuid
      )`;
    const staleAttempts = await Promise.allSettled(
      Array.from({ length: 16 }, (_, index) =>
        (index % 2 ? one : two).attempt("login", staleIdentifier)),
    );
    assert.equal(staleAttempts.filter((result) => result.status === "fulfilled").length, 10);
    const staleDenied = staleAttempts.filter((result) => result.status === "rejected");
    assert.equal(staleDenied.length, 6);
    for (const result of staleDenied) {
      assert.ok(result.status === "rejected");
      assert.equal(authError(result.reason).status, 429);
    }
    const staleCount = await second.$queryRaw<{ attempt_count: number; window_started_at: Date }[]>`
      SELECT attempt_count, window_started_at
      FROM accounts.auth_attempt_limits WHERE attempt_key = ${staleKey}`;
    assert.equal(staleCount[0]?.attempt_count, 11);
    const [databaseCutoff] = await second.$queryRaw<{ cutoff: Date }[]>`
      SELECT clock_timestamp() - interval '1 minute' AS cutoff`;
    assert.ok(staleCount[0]!.window_started_at > databaseCutoff!.cutoff);

    stage = "DB 시각 기반 창 만료";
    await second.$executeRaw`
      UPDATE accounts.auth_attempt_limits
      SET window_started_at = clock_timestamp() - interval '11 minutes',
          expires_at = clock_timestamp() - interval '62 seconds'
      WHERE attempt_key = ${loginKey}`;
    await one.attempt("login", identifier);
    const reset = await second.$queryRaw<{ attempt_count: number }[]>`
      SELECT attempt_count FROM accounts.auth_attempt_limits WHERE attempt_key = ${loginKey}`;
    assert.equal(reset[0]?.attempt_count, 1);

    stage = "실패 로그인 감사와 알 수 없는 계정 동일 응답";
    const passwordHash = await Security.hashPassword(validPassword);
    await MyGlobal.prisma.$executeRaw`
      INSERT INTO accounts.users (id, login_id, handle, nickname, password_hash, created_by, updated_by)
      VALUES (${userId}::uuid, ${userLogin}, ${userHandle}, 'QA 계정', ${passwordHash},
        ${auditPrincipal}::uuid, ${auditPrincipal}::uuid)`;
    const knownError = await AuthProvider.login({ login_id: userLogin, password: wrongPassword })
      .then(() => assert.fail("잘못된 비밀번호를 거부해야 합니다."))
      .catch(authError);
    const unknownError = await AuthProvider.login({ login_id: unknownLogin, password: wrongPassword })
      .then(() => assert.fail("알 수 없는 계정을 거부해야 합니다."))
      .catch(authError);
    assert.deepEqual(knownError, unknownError);

    stage = "로그인 트랜잭션 롤백과 외부 제한 횟수 보존";
    await MyGlobal.prisma.$executeRaw`
      CREATE FUNCTION accounts.tf_qa_fail_auth_attempt_login() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_AUTH_ATTEMPT_ROLLBACK'; END; $$`;
    functionCreated = true;
    await MyGlobal.prisma.$executeRaw`
      CREATE TRIGGER qa_fail_auth_attempt_login BEFORE INSERT ON accounts.auth_sessions
      FOR EACH ROW EXECUTE FUNCTION accounts.tf_qa_fail_auth_attempt_login()`;
    triggerCreated = true;
    await assert.rejects(
      AuthProvider.login({ login_id: userLogin, password: validPassword }),
      (error: unknown) => error instanceof Error && error.message.includes("QA_AUTH_ATTEMPT_ROLLBACK"),
    );
    const persisted = await second.$queryRaw<{ attempt_count: number }[]>`
      SELECT attempt_count FROM accounts.auth_attempt_limits WHERE attempt_key = ${knownKey}`;
    assert.equal(persisted[0]?.attempt_count, 2);
    await second.$executeRaw`
      DROP TRIGGER qa_fail_auth_attempt_login ON accounts.auth_sessions`;
    triggerCreated = false;
    await second.$executeRaw`DROP FUNCTION accounts.tf_qa_fail_auth_attempt_login()`;
    functionCreated = false;
    const sessions = await second.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM accounts.auth_sessions WHERE user_id = ${userId}::uuid`;
    assert.equal(Number(sessions[0]?.count), 0);

    stage = "식별자 비저장 확인";
    const opaqueRows = await second.$queryRaw<{ attempt_key: string }[]>`
      SELECT attempt_key FROM accounts.auth_attempt_limits
      WHERE attempt_key IN (${loginKey}, ${staleKey}, ${knownKey}, ${unknownKey})`;
    const opaqueText = JSON.stringify(opaqueRows);
    for (const secret of [identifier, userLogin, unknownLogin, wrongPassword, validPassword])
      assert.ok(!opaqueText.includes(secret));
    assert.equal(new Set(opaqueRows.map((row) => row.attempt_key)).size, 4);
    console.log("PASS isolated counters, expiry, cleanup concurrency, revoked principal, generic login errors, rollback and opaque keys");
  } finally {
    try {
      if (principalRevoked && second) await second.$executeRaw`
        UPDATE accounts.system_principals SET deleted_at = NULL
        WHERE id = ${throttlePrincipal}::uuid AND code = 'auth_attempt_limiter'`;
      if (triggerCreated) await MyGlobal.prisma.$executeRaw`
        DROP TRIGGER qa_fail_auth_attempt_login ON accounts.auth_sessions`;
      if (functionCreated) await MyGlobal.prisma.$executeRaw`
        DROP FUNCTION accounts.tf_qa_fail_auth_attempt_login()`;
      if (expected && second) {
        await second.$executeRaw`
          DELETE FROM accounts.auth_attempt_limits
          WHERE attempt_key IN (${loginKey}, ${staleKey}, ${revokedKey}, ${knownKey}, ${unknownKey})`;
        await second.$executeRaw`DELETE FROM accounts.users WHERE id = ${userId}::uuid`;
      }
    } finally {
      try {
        await second?.$disconnect();
      } finally {
        await MyGlobal.prisma.$disconnect();
      }
    }
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof assert.AssertionError && typeof error.actual === "number" && typeof error.expected === "number"
    ? ` actual=${error.actual} expected=${error.expected}` : "";
  console.error(`FAIL 격리 인증 시도 제한 검사: ${stage}${detail}`);
  process.exitCode = 1;
});
