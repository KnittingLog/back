import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { MyGlobal } from "../../src/MyGlobal";
import { KnittingLogContext as K } from "../../src/providers/common/KnittingLogContext";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";

class RollbackVerified extends Error {}

async function main(): Promise<void> {
  assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "");
  try {
    try {
      await K.transaction(async (tx) => {
        const [identity] = await tx.$queryRaw<{ directory: string }[]>`SELECT current_setting('data_directory') AS directory`;
        assert.ok(identity?.directory.startsWith("/private/tmp/knittinglog-tdd."));
        const id = randomUUID();
        const identifier = `qa_${id.replaceAll("-", "").slice(0, 24)}`;
        await tx.users.create({ data: { id, login_id: identifier, handle: identifier,
          nickname: "격리 정책 검사", password_hash: "unused_rollback_fixture_hash", ...K.audit(id) } });
        const current = await tx.policy_documents.findMany({ where: { deleted_at: null } });
        await tx.policy_consents.createMany({ data: current.map((document) => ({ user_id: id, policy_document_id: document.id, agreed_at: new Date(), ...K.audit(id) })) });
        const code = `qa_${randomUUID().replaceAll("-", "")}`;
        const rows = [];
        for (const [index, required] of [true, true, false].entries()) {
          rows.push(await tx.policy_documents.create({ data: {
            code, version: `v${index + 1}`, title: "격리 정책 검사", body: "테스트 전용",
            effective_at: new Date(Date.now() - (3 - index) * 86400_000), requires_reconsent: required, ...K.audit(id),
          } }));
        }
        await tx.policy_consents.create({ data: { user_id: id, policy_document_id: rows[0]!.id, agreed_at: new Date(), ...K.audit(id) } });
        await assert.rejects(K.consent(tx, id), (error: unknown) => {
          return error instanceof Error && "getStatus" in error && typeof error.getStatus === "function" && error.getStatus() === 403;
        });
        await tx.policy_consents.create({ data: { user_id: id, policy_document_id: rows[2]!.id, agreed_at: new Date(), ...K.audit(id) } });
        await K.consent(tx, id);
        throw new RollbackVerified();
      });
    } catch (error) {
      if (!(error instanceof RollbackVerified)) throw error;
    }
    console.log("PASS 필수 재동의 우회 거부와 최신 버전 동의; 전체 ROLLBACK");
  } finally {
    await MyGlobal.prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const assertion = error instanceof assert.AssertionError ? "ASSERTION" : "EXECUTION";
  console.error(`FAIL 필수 재동의 경계 검증 ${assertion}`);
  process.exitCode = 1;
});
