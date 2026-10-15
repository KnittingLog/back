import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import api from "@knittinglog/api";

import { MyBackend } from "../../src/MyBackend";
import { MyGlobal } from "../../src/MyGlobal";
import { MyModule } from "../../src/MyModule";
import { KnittingLogContext as K } from "../../src/providers/common/KnittingLogContext";
import { ContentPurgeProvider as P } from "../../src/providers/maintenance/ContentPurgeProvider";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";
import { KnittingLogApi as Api } from "../helpers/KnittingLogApi";

let stage = "격리 대상 확인";

async function main(): Promise<void> {
  assert.equal(process.env.MODE, "local");
  assert.equal(process.env.KNITTINGLOG_TEST_ALLOW_WRITES, "1");
  assert.equal(process.env.KNITTINGLOG_TEST_POSTGRES_PORT, "50801");
  assertIsolatedPostgresUrl(process.env.POSTGRES_URL ?? "", "50801");
  const expected = process.env.KNITTINGLOG_TEST_DATA_DIRECTORY;
  assert.ok(expected && /^\/private\/tmp\/knittinglog-tdd\.[^/]+\/postgres$/.test(expected));

  let app: INestApplication | undefined;
  let functionCreated = false;
  let triggerCreated = false;
  const oldApprovers = process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS;
  const oldExecutors = process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS;
  try {
    const [identity] = await MyGlobal.prisma.$queryRaw<{ directory: string; port: number; address: string; database: string }[]>`
      SELECT current_setting('data_directory') AS directory, inet_server_port() AS port,
        host(inet_server_addr()) AS address, current_database() AS database`;
    assert.deepEqual(identity, { directory: expected, port: 50801, address: "127.0.0.1", database: "knittinglog_tdd" });

    app = await NestFactory.create(MyModule, { logger: false });
    MyBackend.configure(app);
    await app.listen(0, "127.0.0.1");
    const connection: Api.Connection = { host: await app.getUrl() };
    const owner = await Api.register(connection);
    const approver = await Api.register(connection);
    const executor = await Api.register(connection);
    const outsider = await Api.register(connection);
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = approver.session.user.id;
    process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = executor.session.user.id;

    let inventoryMode: "ready" | "stale" | "retained" | "missing" = "ready";
    const inventoryScan = new Date();
    P.configureRetentionInventory({
      async inspect(target) {
        if (inventoryMode === "missing") return undefined;
        return {
          ...target,
          inventory_id: "isolated-synthetic-inventory",
          scanned_at: new Date(inventoryScan.getTime() - (inventoryMode === "stale" ? 6 * 60_000 : 0)).toISOString(),
          covers_through: new Date(inventoryScan.getTime() + 60 * 60_000).toISOString(),
          retain_until: new Date(inventoryScan.getTime() + (inventoryMode === "retained" ? 60_000 : -60_000)).toISOString(),
          no_backup_references: true,
          no_retained_references: true,
        };
      },
    });

    const project = await Api.project(owner);
    const workspace = await Api.workspace(owner, project.id);
    const record = await Api.record(owner, workspace.id);
    const makeComment = async (body: string): Promise<{ id: string }> => Api.request(owner.connection, "POST", `/records/${record.id}/comments`, 201, { body }) as Promise<{ id: string }>;
    const softDelete = async (id: string, deletionId: string): Promise<void> => {
      await MyGlobal.prisma.record_comments.update({ where: { id }, data: {
        deleted_at: new Date(Date.now() - 31 * 86400_000), deletion_operation_id: deletionId,
        ...K.changed(owner.session.user.id),
      } });
    };
    const auth = `Bearer ${approver.session.access_token}`;
    const executionAuth = `Bearer ${executor.session.access_token}`;
    const outsiderAuth = `Bearer ${outsider.session.access_token}`;
    const prepare = async (id: string, deletionId: string, expires = new Date(Date.now() + 60_000).toISOString()): Promise<{ input: P.PrepareInput; snapshots: P.Preview[] }> => {
      const input: P.PrepareInput = {
        operation_id: randomUUID() as P.Uuid,
        deletion_operation_id: deletionId as P.Uuid,
        targets: [{ kind: "record_comment", id: id as P.Uuid }],
        executor_user_id: executor.session.user.id as P.Uuid,
        reason: "격리 콘텐츠 물리 삭제 검증",
        expires_at: expires,
      };
      return { input, snapshots: await api.functional.api.v1.admin.maintenance.content_purge.prepare(approver.connection, { input }) };
    };
    const approve = async (input: P.PrepareInput, snapshots: P.Preview[], approvalId = randomUUID(), expected = snapshots): Promise<string> => {
      await api.functional.api.v1.admin.maintenance.content_purge.approvals.approve(approver.connection, { input: { ...input, approval_id: approvalId as P.Uuid, expected_snapshots: expected } });
      return approvalId;
    };

    stage = "권한 분리 및 백업 증거 거부";
    const badInventoryComment = await makeComment("백업 인벤토리 거부");
    const badInventoryDeletion = randomUUID();
    await softDelete(badInventoryComment.id, badInventoryDeletion);
    const badInventory = await prepare(badInventoryComment.id, badInventoryDeletion);
    inventoryMode = "stale";
    await assert.rejects(P.prepare(auth, badInventory.input));
    inventoryMode = "retained";
    await assert.rejects(P.prepare(auth, badInventory.input));
    inventoryMode = "missing";
    await assert.rejects(P.prepare(auth, badInventory.input));
    inventoryMode = "ready";
    await assert.rejects(P.execute(outsiderAuth, { operation_id: randomUUID() as P.Uuid, approval_id: randomUUID() as P.Uuid }));
    await assert.rejects(P.prepare(`Bearer ${owner.session.access_token}`, badInventory.input));

    stage = "미리보기 위조 및 변경된 승인 거부";
    const changedApprovalComment = await makeComment("승인 전 상태 확인");
    const changedApprovalDeletion = randomUUID();
    await softDelete(changedApprovalComment.id, changedApprovalDeletion);
    const changedApproval = await prepare(changedApprovalComment.id, changedApprovalDeletion);
    const forged = changedApproval.snapshots.map((snapshot) => ({ ...snapshot, inventory_id: "forged" }));
    await assert.rejects(P.approve(auth, { ...changedApproval.input, approval_id: randomUUID() as P.Uuid, expected_snapshots: forged }));
    const staleApprovalId = await approve(changedApproval.input, changedApproval.snapshots);
    await MyGlobal.prisma.record_comments.update({ where: { id: changedApprovalComment.id }, data: { body: "승인 뒤 변경", ...K.changed(owner.session.user.id) } });
    await assert.rejects(P.execute(executionAuth, { operation_id: randomUUID() as P.Uuid, approval_id: staleApprovalId as P.Uuid }));

    stage = "만료 및 승인자 권한 회수 거부";
    const expiryComment = await makeComment("만료된 승인");
    const expiryDeletion = randomUUID();
    await softDelete(expiryComment.id, expiryDeletion);
    const expiryPlan = await prepare(expiryComment.id, expiryDeletion);
    const expiryApprovalId = await approve(expiryPlan.input, expiryPlan.snapshots);
    const expiryReceipt = await MyGlobal.prisma.command_receipts.findUniqueOrThrow({ where: { id: expiryApprovalId } });
    const expiryResult = JSON.parse(JSON.stringify(expiryReceipt.result)) as { value: { approval: { expires_at: string } } };
    expiryResult.value.approval.expires_at = new Date(Date.now() - 1000).toISOString();
    await MyGlobal.prisma.command_receipts.update({ where: { id: expiryApprovalId }, data: { result: expiryResult } });
    await assert.rejects(P.execute(executionAuth, { operation_id: randomUUID() as P.Uuid, approval_id: expiryApprovalId as P.Uuid }));

    const revokedComment = await makeComment("회수된 승인자 권한");
    const revokedDeletion = randomUUID();
    await softDelete(revokedComment.id, revokedDeletion);
    const revokedPlan = await prepare(revokedComment.id, revokedDeletion);
    const revokedApprovalId = await approve(revokedPlan.input, revokedPlan.snapshots);
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = outsider.session.user.id;
    await assert.rejects(P.execute(executionAuth, { operation_id: randomUUID() as P.Uuid, approval_id: revokedApprovalId as P.Uuid }));
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = approver.session.user.id;

    stage = "보존 자식 참조 거부";
    const dependencyRecord = await Api.record(owner, workspace.id);
    const dependencyComment = await Api.request(owner.connection, "POST", `/records/${dependencyRecord.id}/comments`, 201, { body: "보존 자식" }) as { id: string };
    const parentDeletion = randomUUID();
    await MyGlobal.prisma.project_records.update({ where: { id: dependencyRecord.id }, data: { deleted_at: new Date(Date.now() - 31 * 86400_000), deletion_operation_id: parentDeletion, ...K.changed(owner.session.user.id) } });
    await assert.rejects(P.prepare(auth, {
      operation_id: randomUUID() as P.Uuid, deletion_operation_id: parentDeletion as P.Uuid,
      targets: [{ kind: "record", id: dependencyRecord.id as P.Uuid }], executor_user_id: executor.session.user.id as P.Uuid,
      reason: "자식 보존 거부", expires_at: new Date(Date.now() + 60_000).toISOString(),
    }));
    assert.notEqual(await MyGlobal.prisma.record_comments.findUnique({ where: { id: dependencyComment.id } }), null);

    stage = "물리 삭제, 재시도 및 충돌 검사";
    const removable = await makeComment("삭제 가능한 leaf");
    const deletionId = randomUUID();
    await softDelete(removable.id, deletionId);
    const planned = await prepare(removable.id, deletionId);
    const approvalId = await approve(planned.input, planned.snapshots);
    const operationId = randomUUID() as P.Uuid;
    const command = { operation_id: operationId, approval_id: approvalId as P.Uuid };
    await assert.rejects(P.execute(outsiderAuth, command));
    const result = await api.functional.api.v1.admin.maintenance.content_purge.execute(executor.connection, { input: command });
    assert.deepEqual(result, { approval_id: approvalId, purged: [{ kind: "record_comment", id: removable.id }] });
    assert.equal(await MyGlobal.prisma.record_comments.findUnique({ where: { id: removable.id } }), null);
    assert.deepEqual(await P.execute(executionAuth, command), result);
    await assert.rejects(P.execute(executionAuth, { operation_id: randomUUID() as P.Uuid, approval_id: approvalId as P.Uuid }));
    await assert.rejects(P.execute(executionAuth, { operation_id: operationId, approval_id: randomUUID() as P.Uuid }));

    stage = "실패한 삭제와 승인 소비의 트랜잭션 롤백";
    const rollbackComment = await makeComment("트리거 롤백");
    const rollbackOther = await makeComment("첫 삭제 롤백");
    const rollbackDeletion = randomUUID();
    await softDelete(rollbackComment.id, rollbackDeletion);
    await softDelete(rollbackOther.id, rollbackDeletion);
    const rollbackPlan = await prepare(rollbackComment.id, rollbackDeletion);
    rollbackPlan.input.targets.push({ kind: "record_comment", id: rollbackOther.id as P.Uuid });
    const secondId = [rollbackComment.id, rollbackOther.id].sort((a, b) => a.localeCompare(b))[1]!;
    await MyGlobal.prisma.record_comments.update({ where: { id: secondId }, data: { body: "격리 둘째 삭제 실패", ...K.changed(owner.session.user.id) } });
    const rollbackSnapshots = await P.prepare(auth, rollbackPlan.input);
    const rollbackApproval = await approve(rollbackPlan.input, rollbackSnapshots);
    await MyGlobal.prisma.$executeRaw`CREATE FUNCTION projects.tf_qa_fail_content_purge() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN
        IF OLD.body = '격리 둘째 삭제 실패' THEN RAISE EXCEPTION 'QA_CONTENT_PURGE_ROLLBACK'; END IF;
        RETURN OLD;
      END; $$`;
    functionCreated = true;
    await MyGlobal.prisma.$executeRaw`CREATE TRIGGER qa_fail_content_purge BEFORE DELETE ON projects.record_comments
      FOR EACH ROW EXECUTE FUNCTION projects.tf_qa_fail_content_purge()`;
    triggerCreated = true;
    const rollbackCommand = { operation_id: randomUUID() as P.Uuid, approval_id: rollbackApproval as P.Uuid };
    await assert.rejects(P.execute(executionAuth, rollbackCommand));
    assert.notEqual(await MyGlobal.prisma.record_comments.findUnique({ where: { id: rollbackComment.id } }), null);
    assert.notEqual(await MyGlobal.prisma.record_comments.findUnique({ where: { id: rollbackOther.id } }), null);
    assert.equal(await MyGlobal.prisma.command_receipts.findUnique({ where: { id: rollbackCommand.operation_id } }), null);
    await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_content_purge ON projects.record_comments`;
    triggerCreated = false;
    await MyGlobal.prisma.$executeRaw`DROP FUNCTION projects.tf_qa_fail_content_purge()`;
    functionCreated = false;
    assert.deepEqual(await P.execute(executionAuth, rollbackCommand), { approval_id: rollbackApproval, purged: rollbackPlan.input.targets.slice().sort((a, b) => a.id.localeCompare(b.id)) });
    assert.equal(await MyGlobal.prisma.record_comments.findUnique({ where: { id: rollbackComment.id } }), null);
    assert.equal(await MyGlobal.prisma.record_comments.findUnique({ where: { id: rollbackOther.id } }), null);
    console.log("PASS 격리 콘텐츠 물리 삭제 권한·보존·참조·재시도·원자성 검사");
  } finally {
    try {
      if (triggerCreated) await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_content_purge ON projects.record_comments`;
      if (functionCreated) await MyGlobal.prisma.$executeRaw`DROP FUNCTION projects.tf_qa_fail_content_purge()`;
    } finally {
      if (oldApprovers === undefined) delete process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS;
      else process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = oldApprovers;
      if (oldExecutors === undefined) delete process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS;
      else process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = oldExecutors;
      try { await app?.close(); } finally { await MyGlobal.prisma.$disconnect(); }
    }
  }
}

main().catch(() => {
  console.error(`FAIL 격리 콘텐츠 물리 삭제 검사: ${stage}`);
  process.exitCode = 1;
});
