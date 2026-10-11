import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import typia from "typia";

import { MyBackend } from "../../src/MyBackend";
import { MyGlobal } from "../../src/MyGlobal";
import { MyModule } from "../../src/MyModule";
import { AuthProvider } from "../../src/providers/auth/AuthProvider";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";
import { KnittingLogApi as K } from "../helpers/KnittingLogApi";

async function main(): Promise<void> {
  assert.equal(process.env.MODE, "local");
  assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1");
  assert.equal(process.env.KNITTINGLOG_TEST_POSTGRES_PORT, "50801");
  assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "", "50801");
  const expected = process.env.KNITTINGLOG_TEST_DATA_DIRECTORY;
  assert.ok(expected && /^\/private\/tmp\/knittinglog-tdd\.[^/]+\/postgres$/.test(expected));
  let app: INestApplication | undefined;
  const verifier = AuthProvider.passwordVerifier;
  try {
    const [identity] = await MyGlobal.prisma.$queryRaw<{ directory: string; port: number; address: string; database: string }[]>`
      SELECT current_setting('data_directory') AS directory, inet_server_port() AS port,
        host(inet_server_addr()) AS address, current_database() AS database`;
    assert.deepEqual(identity, { directory: expected, port: 50801, address: "127.0.0.1", database: "knittinglog_tdd" });
    app = await NestFactory.create(MyModule, { logger: false });
    MyBackend.configure(app);
    await app.listen(0, "127.0.0.1");
    const connection: K.Connection = { host: await app.getUrl() };
    const actor = await K.register(connection);
    const policies = typia.assert<K.Policy[]>(await K.request(connection, "GET", "/policy-documents", 200), K.invalidResponse);
    const input: K.Registration = {
      login_id: K.identifier(), handle: K.identifier(), nickname: "유출 비밀번호 검사",
      password: `Qa!${randomUUID()}aA1`, policy_document_ids: policies.map((policy) => policy.id),
    };
    const snapshot = () => Promise.all([
      MyGlobal.prisma.users.findMany({ orderBy: { id: "asc" } }),
      MyGlobal.prisma.user_identifiers.findMany({ orderBy: { id: "asc" } }),
      MyGlobal.prisma.policy_consents.findMany({ orderBy: { id: "asc" } }),
      MyGlobal.prisma.recovery_codes.findMany({ orderBy: { id: "asc" } }),
      MyGlobal.prisma.auth_sessions.findMany({ orderBy: { id: "asc" } }),
    ]);
    const before = await snapshot();
    for (const [decision, status, code] of [
      ["breached", 400, "INVALID_PASSWORD"],
      ["unavailable", 503, "PASSWORD_SCREENING_UNAVAILABLE"],
    ] as const) {
      AuthProvider.passwordVerifier = async () => decision;
      assert.equal((await K.error(connection, "POST", "/auth/register", status, input)).code, code);
      assert.equal((await K.error(connection, "POST", "/auth/recovery", status, {
        login_id: actor.input.login_id, recovery_code: actor.session.recovery_code, password: input.password,
      })).code, code);
      assert.deepEqual(await snapshot(), before, "거부한 비밀번호는 계정·동의·복구 코드·세션을 변경하지 않습니다.");
    }
    AuthProvider.passwordVerifier = async () => "safe";
    const recovered = typia.assert<K.RecoverySession>(await K.request(connection, "POST", "/auth/recovery", 200, {
      login_id: actor.input.login_id, recovery_code: actor.session.recovery_code, password: input.password,
    }), K.invalidResponse);
    assert.equal(recovered.user.id, actor.session.user.id);
    await K.error(actor.connection, "GET", "/users/me", 401);
    await K.error(connection, "POST", "/auth/refresh", 401, { refresh_token: actor.session.refresh_token });
    await K.error(connection, "POST", "/auth/recovery", 401, {
      login_id: actor.input.login_id, recovery_code: actor.session.recovery_code, password: input.password,
    });
    assert.equal(typia.assert<K.User>(await K.request({ ...connection, headers: { Authorization: `Bearer ${recovered.access_token}` } }, "GET", "/users/me", 200), K.invalidResponse).id, actor.session.user.id);
    console.log("PASS 제공자 거부/장애의 HTTP 400/503·계정 변경 부재·복구 코드 보존·복구 성공 후 과거 인증 거부");
  } finally {
    AuthProvider.passwordVerifier = verifier;
    try { await app?.close(); } finally { await MyGlobal.prisma.$disconnect(); }
  }
}

main().catch(() => {
  console.error("FAIL 격리 유출 비밀번호 HTTP/DB 검사");
  process.exitCode = 1;
});
