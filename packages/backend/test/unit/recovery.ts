import assert from "node:assert/strict";

import { MaintenanceAuthorization as A } from "../../src/providers/maintenance/MaintenanceAuthorization";
import { RecoveryProvider as R } from "../../src/providers/maintenance/RecoveryProvider";

const approver = "11111111-1111-4111-8111-111111111111";
const executor = "22222222-2222-4222-8222-222222222222";

function denied(work: () => unknown): void {
  assert.throws(work, (error: unknown) => error instanceof Error && error.message.includes("복구 운영 권한 설정"));
}

async function main(): Promise<void> {
  const oldApprovers = process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS;
  const oldExecutors = process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS;
  try {
    delete process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS;
    denied(() => A.isApprover(approver));
    denied(() => A.isExecutor(executor));
    process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = "not-a-uuid";
    denied(() => A.isExecutor(executor));
    process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = `${executor},${executor}`;
    denied(() => A.isExecutor(executor));
    process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = approver;
    process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = executor;
    assert.equal(A.isApprover(executor), false);
    assert.equal(A.isApprover(approver), true);
    assert.equal(A.isExecutor(approver), false);
    assert.equal(A.isExecutor(executor), true);
    await assert.rejects(R.approve(undefined, {
      operation_id: approver as R.Uuid,
      approval_id: executor as R.Uuid,
      deletion_operation_id: approver as R.Uuid,
      targets: [{ kind: "project", id: executor as R.Uuid }],
      executor_user_id: executor as R.Uuid,
      reason: "test",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      expected_snapshots: [],
      approved: true,
    } as R.Approve));
    await assert.rejects(R.execute(undefined, {
      operation_id: approver as R.Uuid,
      approval_id: executor as R.Uuid,
      approved: true,
    } as R.Execute));
  } finally {
    if (oldApprovers === undefined) delete process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS;
    else process.env.KNITTINGLOG_MAINTENANCE_APPROVER_USER_IDS = oldApprovers;
    if (oldExecutors === undefined) delete process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS;
    else process.env.KNITTINGLOG_MAINTENANCE_EXECUTOR_USER_IDS = oldExecutors;
  }
}

main().then(() => console.log("PASS 복구 승인·실행 권한 분리와 환경 설정 fail-closed")).catch(() => {
  console.error("FAIL 복구 권한 설정 경계");
  process.exitCode = 1;
});
