import assert from "node:assert/strict";

import { AccountProvider } from "../../src/providers/accounts/AccountProvider";
import { KnittingLogContext as K } from "../../src/providers/common/KnittingLogContext";
import { PolicyProvider } from "../../src/providers/policies/PolicyProvider";

// DB 연결 없이 응답 투영과 정렬 계약만 검증합니다.
async function main(): Promise<void> {
  const user = {
    id: "00000000-0000-4000-8000-000000000001", handle: "qa_actor", nickname: "작성자",
    biography: null, visibility: "public", password_hash: "검증용 해시", deleted_at: null,
  };
  const tx = {
    users: { findUnique: async () => user },
    auth_sessions: { findUnique: async () => ({ user_id: user.id, revoked_at: null, deleted_at: null,
      access_expires_at: new Date(Date.now() + 60_000), expires_at: new Date(Date.now() + 60_000) }) },
    project_records: { findMany: async () => [{
      id: "00000000-0000-4000-8000-000000000002", workspace_id: "00000000-0000-4000-8000-000000000003",
      author_id: user.id, source: "manual", body: "작업 기록", duration_seconds: 60,
      recorded_at: new Date("2026-10-09T00:00:00.000Z"), author: user,
    }] },
    policy_consents: { findMany: async (query: { orderBy: unknown }) => {
      assert.deepEqual(query.orderBy, [{ agreed_at: "asc" }, { policy_document_id: "asc" }, { id: "asc" }]);
      return [];
    } },
  } as unknown as K.Tx;
  const transaction = K.transaction;
  try {
    K.transaction = async <T>(work: (connection: K.Tx) => Promise<T>): Promise<T> => work(tx);
    const rows = await AccountProvider.records(`Bearer ${"t".repeat(43)}`);
    assert.equal((rows[0] as unknown as { author_name: string }).author_name, user.nickname);
    assert.ok(!JSON.stringify(rows).includes(user.password_hash));
    assert.deepEqual(await PolicyProvider.consents(tx, user.id), []);
  } finally {
    K.transaction = transaction;
  }
  console.log("PASS account author label and deterministic policy consent order");
}

main().catch(() => {
  console.error("FAIL account author label and deterministic policy consent order");
  process.exitCode = 1;
});
