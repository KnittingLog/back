import api from "@knittinglog/api";
import { RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";

import { MyBackend } from "../../src/MyBackend";
import { MyModule } from "../../src/MyModule";
import { KnittingLogModule } from "../../src/controllers/KnittingLogModule";
import { AccountController } from "../../src/controllers/accounts/v1/AccountController";
import { AccountProvider } from "../../src/providers/accounts/AccountProvider";
import { AuthProvider } from "../../src/providers/auth/AuthProvider";
import { KnittingLogContext as K } from "../../src/providers/common/KnittingLogContext";

async function main(): Promise<void> {
  const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, KnittingLogModule) as Array<{ prototype: object }>;
  const handlers = controllers.flatMap((controller) => {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
    return Object.getOwnPropertyNames(controller.prototype).flatMap((key) => {
      const method = Reflect.get(controller.prototype, key);
      if (typeof method !== "function" || Reflect.getMetadata(METHOD_METADATA, method) !== RequestMethod.GET) return [];
      const route = Reflect.getMetadata(PATH_METADATA, method) as string;
      const path = [prefix, route].map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
      return path === "users/me/memberships" ? [{ controller, key }] : [];
    });
  });
  assert.equal(handlers.length, 1, "내 참여 이력의 GET 핸들러는 하나여야 합니다.");
  assert.equal(handlers[0]!.controller, AccountController);
  assert.equal(handlers[0]!.key, "memberships");
  const userId = "00000000-0000-4000-8000-000000000001";
  const rows = [
    { id: "00000000-0000-4000-8000-000000000003", project_id: "00000000-0000-4000-8000-000000000004", user_id: userId, left_at: null },
    { id: "00000000-0000-4000-8000-000000000002", project_id: "00000000-0000-4000-8000-000000000004", user_id: userId, left_at: new Date("2026-10-10T00:00:00.000Z") },
  ];
  const tx = { project_memberships: { findMany: async (query: unknown) => {
    assert.deepEqual(query, { where: { user_id: userId }, orderBy: [{ created_at: "desc" }, { id: "desc" }] });
    return rows;
  } } } as unknown as K.Tx;
  const actor = AuthProvider.actor;
  const transaction = K.transaction;
  const memberships = AccountProvider.memberships;
  const authorization = `Bearer ${"t".repeat(43)}`;
  let expected: AccountProvider.Membership[];
  try {
    AuthProvider.actor = async (input, connection) => {
      assert.equal(input, authorization);
      assert.equal(connection, tx);
      return { id: userId } as Awaited<ReturnType<typeof AuthProvider.actor>>;
    };
    K.transaction = async <T>(work: (connection: K.Tx) => Promise<T>): Promise<T> => work(tx);
    expected = await AccountProvider.memberships(authorization);
    assert.deepEqual(expected, rows.map((row) => ({ ...row, left_at: row.left_at?.toISOString() ?? null })));
  } finally {
    AuthProvider.actor = actor;
    K.transaction = transaction;
  }

  // 라우팅과 SDK 연결만 검사합니다. 실제 인증·DB 동작은 격리 API 검사로 확인합니다.
  const app = await NestFactory.create(MyModule, { logger: false });
  let calls = 0;
  try {
    AccountProvider.memberships = async (input) => {
      assert.equal(input, authorization);
      calls++;
      return expected;
    };
    MyBackend.configure(app);
    await app.listen(0, "127.0.0.1");
    const host = await app.getUrl();
    const response = await fetch(`${host}/api/v1/users/me/memberships`, { headers: { Authorization: authorization } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
    const sdk = api.functional.api.v1.users.me.memberships;
    assert.equal("get" in sdk, false, "삭제한 중복 컨트롤러의 SDK 함수를 생성하지 않습니다.");
    assert.deepEqual(await sdk({ host, headers: { Authorization: authorization } }), expected);
    assert.equal(calls, 2);
  } finally {
    AccountProvider.memberships = memberships;
    await app.close();
  }
  console.log("PASS 내 참여 이력의 단일 AccountController·사용자 범위·최신순·종료 이력·SDK 호출");
}

main().catch((error: unknown) => {
  let detail = "";
  if (error instanceof assert.AssertionError && typeof error.actual === "number" && typeof error.expected === "number")
    detail = ` actual=${error.actual} expected=${error.expected}`;
  console.error(`FAIL 내 참여 이력 계약${detail}`);
  process.exitCode = 1;
});
