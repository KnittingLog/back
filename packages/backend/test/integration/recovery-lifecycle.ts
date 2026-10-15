import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import api from "@knittinglog/api";

import { MyBackend } from "../../src/MyBackend";
import { MyGlobal } from "../../src/MyGlobal";
import { MyModule } from "../../src/MyModule";
import { KnittingLogContext as C } from "../../src/providers/common/KnittingLogContext";
import { RecoveryProvider as R } from "../../src/providers/maintenance/RecoveryProvider";
import { ProjectProvider as P } from "../../src/providers/projects/ProjectProvider";
import { assertIsolatedPostgresUrl } from "../helpers/IsolatedPostgres";
import { KnittingLogApi as K } from "../helpers/KnittingLogApi";

let stage = "대상 확인";

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
    const connection: K.Connection = { host: await app.getUrl() };
    const approver = await K.register(connection);
    const executor = await K.register(connection);
    const successor = await K.register(connection);
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = approver.session.user.id;
    process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = executor.session.user.id;
    const project = await K.project(approver);
    await K.befriend(approver, successor);
    await K.join(approver, successor, project.id);
    const workspace = await K.workspace(approver, project.id);
    const record = await K.record(approver, workspace.id);
    const comment = await K.request(approver.connection, "POST", `/records/${record.id}/comments`, 201, { body: "복구 자식 보존" }) as { id: string };
    const childDeletion = randomUUID();
    await MyGlobal.prisma.record_comments.update({ where: { id: comment.id }, data: { deleted_at: new Date(), deletion_operation_id: childDeletion } });
    const deletionId = randomUUID();
    await MyGlobal.prisma.project_records.update({ where: { id: record.id }, data: { deleted_at: new Date(), deletion_operation_id: deletionId } });
    const auth = `Bearer ${approver.session.access_token}`;
    const executorAuth = `Bearer ${executor.session.access_token}`;
    const approveContent = async (input: Omit<R.Approve, "expected_snapshots">): Promise<{ approval_id: string; expires_at: string }> => {
      const { approval_id, ...prepared } = input;
      const expected_snapshots = await api.functional.api.v1.admin.maintenance.recovery.prepare(approver.connection, { input: prepared });
      return await api.functional.api.v1.admin.maintenance.recovery.approvals.approve(approver.connection, { input: { ...prepared, approval_id, expected_snapshots } });
    };
    const approveReverse = async (input: Omit<R.ReverseApprove, "expected_snapshot">): Promise<{ approval_id: string; expires_at: string }> => {
      const { approval_id, ...prepared } = input;
      const expected_snapshot = await api.functional.api.v1.admin.maintenance.recovery.reverse_transfers.prepare.prepareReverse(approver.connection, { input: prepared });
      return await api.functional.api.v1.admin.maintenance.recovery.reverse_transfers.approvals.approveReverse(approver.connection, { input: { ...prepared, approval_id, expected_snapshot } });
    };
    const base: R.Prepare = {
      operation_id: randomUUID() as R.Uuid,
      deletion_operation_id: deletionId as R.Uuid,
      targets: [{ kind: "record", id: record.id as R.Uuid }],
      executor_user_id: executor.session.user.id as R.Uuid,
      reason: "격리 복구 수용 검사",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };

    stage = "미승인 실행 거부";
    await assert.rejects(R.execute(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: randomUUID() as R.Uuid }));
    stage = "검토 이후 승인 이전 변경 거부";
    const preview = await R.prepare(auth, base);
    await MyGlobal.prisma.project_records.update({ where: { id: record.id }, data: { body: "검토 이후 변경", ...C.changed(approver.session.user.id) } });
    await assert.rejects(R.approve(auth, { ...base, approval_id: randomUUID() as R.Uuid, expected_snapshots: preview }));
    stage = "승인 이후 상태 변경 거부";
    const staleApprovalId = randomUUID() as R.Uuid;
    await approveContent({ ...base, approval_id: staleApprovalId });
    await MyGlobal.prisma.project_records.update({ where: { id: record.id }, data: { body: "changed after approval", ...C.changed(approver.session.user.id) } });
    await assert.rejects(R.execute(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: staleApprovalId }));

    stage = "삭제 기간 초과 거부";
    await MyGlobal.prisma.project_records.update({ where: { id: record.id }, data: { deleted_at: new Date(Date.now() - 31 * 86400_000), body: record.body, ...C.changed(approver.session.user.id) } });
    await assert.rejects(R.prepare(auth, { ...base, operation_id: randomUUID() as R.Uuid }));

    stage = "복구 부분 실패의 전체 롤백";
    const rollbackProject = await K.project(approver);
    const rollbackWorkspace = await K.workspace(approver, rollbackProject.id);
    const rollbackRecord = await K.record(approver, rollbackWorkspace.id);
    const rollbackDeletion = randomUUID();
    await MyGlobal.prisma.projects.update({ where: { id: rollbackProject.id }, data: { deleted_at: new Date(), deletion_operation_id: rollbackDeletion } });
    await MyGlobal.prisma.project_records.update({ where: { id: rollbackRecord.id }, data: { deleted_at: new Date(), deletion_operation_id: rollbackDeletion } });
    const rollbackApproval = randomUUID() as R.Uuid;
    await approveContent({
      ...base,
      operation_id: randomUUID() as R.Uuid,
      approval_id: rollbackApproval,
      deletion_operation_id: rollbackDeletion as R.Uuid,
      targets: [{ kind: "project", id: rollbackProject.id as R.Uuid }, { kind: "record", id: rollbackRecord.id as R.Uuid }],
    });
    await MyGlobal.prisma.$executeRaw`CREATE FUNCTION projects.tf_qa_fail_recovery() RETURNS trigger
      LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'QA_RECOVERY_ROLLBACK'; END; $$`;
    functionCreated = true;
    await MyGlobal.prisma.$executeRaw`CREATE TRIGGER qa_fail_recovery BEFORE UPDATE ON projects.project_records
      FOR EACH ROW EXECUTE FUNCTION projects.tf_qa_fail_recovery()`;
    triggerCreated = true;
    await assert.rejects(R.execute(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: rollbackApproval }));
    assert.notEqual((await MyGlobal.prisma.projects.findUniqueOrThrow({ where: { id: rollbackProject.id } })).deleted_at, null);
    await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_recovery ON projects.project_records`;
    triggerCreated = false;
    await MyGlobal.prisma.$executeRaw`DROP FUNCTION projects.tf_qa_fail_recovery()`;
    functionCreated = false;
    assert.deepEqual(await R.execute(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: rollbackApproval }), { restored: 2 });
    assert.equal((await MyGlobal.prisma.projects.findUniqueOrThrow({ where: { id: rollbackProject.id } })).deleted_at, null);

    stage = "정상 복구와 멱등 재시도 입력 검사";
    await MyGlobal.prisma.project_records.update({ where: { id: record.id }, data: { deleted_at: new Date(), body: record.body, ...C.changed(approver.session.user.id) } });
    const fresh = { ...base, operation_id: randomUUID() as R.Uuid, expires_at: new Date(Date.now() + 60_000).toISOString() };
    const expiringApprovalId = randomUUID() as R.Uuid;
    await approveContent({ ...fresh, approval_id: expiringApprovalId, expires_at: new Date(Date.now() + 5_000).toISOString() });
    await new Promise((resolve) => { setTimeout(() => resolve(undefined), 5_100); });
    await assert.rejects(R.execute(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: expiringApprovalId }));
    const approvalId = randomUUID() as R.Uuid;
    await approveContent({ ...fresh, approval_id: approvalId });
    stage = "승인자 권한 회수 후 실행 거부";
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = successor.session.user.id;
    await assert.rejects(R.execute(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: approvalId }));
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = approver.session.user.id;
    stage = "정상 복구와 멱등 재시도 입력 검사";
    const executionId = randomUUID() as R.Uuid;
    const execution = { operation_id: executionId, approval_id: approvalId };
    assert.deepEqual(await api.functional.api.v1.admin.maintenance.recovery.execute(executor.connection, { input: execution }), { restored: 1 });
    assert.deepEqual(await R.execute(executorAuth, execution), { restored: 1 });
    await assert.rejects(R.execute(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: approvalId }));
    await assert.rejects(R.execute(executorAuth, { operation_id: executionId, approval_id: randomUUID() as R.Uuid }));
    assert.equal((await MyGlobal.prisma.project_records.findUniqueOrThrow({ where: { id: record.id } })).deleted_at, null);
    assert.equal((await MyGlobal.prisma.project_records.findUniqueOrThrow({ where: { id: record.id } })).id, record.id);
    assert.notEqual((await MyGlobal.prisma.record_comments.findUniqueOrThrow({ where: { id: comment.id } })).deleted_at, null);

    stage = "역이관 승인 후 version 충돌 거부와 ID 보존";
    const currentWorkspace = await MyGlobal.prisma.project_workspaces.findUniqueOrThrow({ where: { id: workspace.id } });
    const moved = await P.move(auth, project.id, undefined, {
      operation_id: randomUUID() as P.Uuid,
      workspace_id: workspace.id as P.Uuid,
      expected_version: currentWorkspace.version,
      successor_user_id: successor.session.user.id as P.Uuid,
    });
    const reverseBase: R.ReversePrepare = {
      operation_id: randomUUID() as R.Uuid, transfer_id: moved.id as R.Uuid,
      executor_user_id: executor.session.user.id as R.Uuid, reason: "격리 역이관 권한 검사",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    stage = "역이관 대상 프로젝트의 다른 참여자 보존";
    const extraMembership = await MyGlobal.prisma.project_memberships.create({ data: {
      project_id: moved.to_project_id, user_id: executor.session.user.id, ...C.audit(approver.session.user.id),
    } });
    await assert.rejects(R.prepareReverse(auth, reverseBase));
    await MyGlobal.prisma.project_memberships.delete({ where: { id: extraMembership.id } });
    stage = "역이관 원 프로젝트의 참여 상한 거부";
    const capacityUsers = Array.from({ length: 19 }, () => randomUUID());
    await MyGlobal.prisma.users.createMany({ data: capacityUsers.map((id) => ({
      id, login_id: id.replaceAll("-", ""), handle: id.replaceAll("-", ""),
      nickname: "격리 인원 상한 검사", password_hash: "isolated-capacity-fixture", ...C.audit(approver.session.user.id),
    })) });
    await MyGlobal.prisma.project_memberships.createMany({ data: capacityUsers.map((id) => ({
      project_id: project.id, user_id: id, ...C.audit(approver.session.user.id),
    })) });
    await assert.rejects(R.prepareReverse(auth, reverseBase));
    await MyGlobal.prisma.project_memberships.deleteMany({ where: { project_id: project.id, user_id: { in: capacityUsers } } });
    await MyGlobal.prisma.users.deleteMany({ where: { id: { in: capacityUsers } } });
    stage = "정상 역이관과 원 이력 보존";
    const reverseApprovalId = randomUUID() as R.Uuid;
    await approveReverse({
      operation_id: randomUUID() as R.Uuid,
      approval_id: reverseApprovalId,
      transfer_id: moved.id as R.Uuid,
      executor_user_id: executor.session.user.id as R.Uuid,
      reason: "격리 역이관 충돌 검사",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const reverseOperationId = randomUUID() as R.Uuid;
    const reversed = await api.functional.api.v1.admin.maintenance.recovery.reverse_transfers.execute.executeReverse(executor.connection, { input: { operation_id: reverseOperationId, approval_id: reverseApprovalId } });
    assert.equal(reversed.workspace_id, workspace.id);
    assert.equal(reversed.project_id, project.id);
    const reverseHistory = await MyGlobal.prisma.workspace_transfers.findUniqueOrThrow({ where: { id: reverseOperationId } });
    assert.equal(reverseHistory.from_membership_id, moved.to_membership_id);
    assert.notEqual(reverseHistory.to_membership_id, moved.from_membership_id);
    assert.ok(await MyGlobal.prisma.command_receipts.findUnique({ where: { id: reverseOperationId } }));

    const returnedWorkspace = await MyGlobal.prisma.project_workspaces.findUniqueOrThrow({ where: { id: workspace.id } });
    const nextMove = await P.move(auth, project.id, undefined, {
      operation_id: randomUUID() as P.Uuid,
      workspace_id: workspace.id as P.Uuid,
      expected_version: returnedWorkspace.version,
    });
    const staleReverseApprovalId = randomUUID() as R.Uuid;
    await approveReverse({
      operation_id: randomUUID() as R.Uuid,
      approval_id: staleReverseApprovalId,
      transfer_id: nextMove.id as R.Uuid,
      executor_user_id: executor.session.user.id as R.Uuid,
      reason: "격리 역이관 충돌 검사",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    await MyGlobal.prisma.project_workspaces.update({ where: { id: workspace.id }, data: { version: { increment: 1 }, ...C.changed(approver.session.user.id) } });
    await assert.rejects(R.executeReverse(executorAuth, { operation_id: randomUUID() as R.Uuid, approval_id: staleReverseApprovalId }));
    await assert.rejects(R.prepareReverse(auth, { ...reverseBase, transfer_id: nextMove.id as R.Uuid }));
    const afterConflict = await MyGlobal.prisma.project_workspaces.findUniqueOrThrow({ where: { id: workspace.id } });
    assert.equal(afterConflict.id, workspace.id);
    assert.equal(afterConflict.project_id, nextMove.to_project_id);
    console.log("PASS 격리 복구 승인·상태 스냅샷·기간 경계·식별자 보존·재시도 입력 검사");
  } finally {
    try {
      if (triggerCreated) await MyGlobal.prisma.$executeRaw`DROP TRIGGER qa_fail_recovery ON projects.project_records`;
      if (functionCreated) await MyGlobal.prisma.$executeRaw`DROP FUNCTION projects.tf_qa_fail_recovery()`;
    } finally {
    if (oldApprovers === undefined) delete process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS;
    else process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = oldApprovers;
    if (oldExecutors === undefined) delete process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS;
    else process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = oldExecutors;
    try { await app?.close(); } finally { await MyGlobal.prisma.$disconnect(); }
    }
  }
}

main().catch((error: unknown) => {
  let detail = "";
  if (error instanceof assert.AssertionError && typeof error.actual === "number" && typeof error.expected === "number") detail = ` actual=${error.actual} expected=${error.expected}`;
  console.error(`FAIL 격리 복구 수용 검사: ${stage}${detail}`);
  process.exitCode = 1;
});
