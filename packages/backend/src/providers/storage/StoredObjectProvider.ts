import type { stored_objects } from "@prisma/sdk";
import typia, { type tags } from "typia";
import { v5 as uuidV5 } from "uuid";

import { AuthProvider } from "../auth/AuthProvider";
import { KnittingLogContext as K } from "../common/KnittingLogContext";
import { MaintenanceAuthorization as A } from "../maintenance/MaintenanceAuthorization";
import { assertPurgeEligible, RetentionInventory, unavailableRetentionInventory, verifyStoredObject } from "./StorageConfiguration";
import { StoragePort, StoredBytes } from "./StoragePort";

export namespace StoredObjectProvider {
  export type Uuid = string & tags.Format<"uuid">;
  export interface Adapter { readonly storageCode: string; readonly storage: StoragePort }
  export interface PurgePrepare {
    operation_id: Uuid;
    object_id: Uuid;
    executor_user_id: Uuid;
    reason: string;
    expires_at: string;
  }
  export interface PurgeExecute { operation_id: Uuid; approval_id: Uuid }
  interface Snapshot {
    id: string;
    owner_user_id: string;
    storage_code: string;
    object_key: string;
    sha256: string;
    byte_size: string;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    purged_at: string | null;
  }
  interface Approval {
    approver_user_id: string;
    executor_user_id: string;
    reason: string;
    expires_at: string;
    snapshot: Snapshot;
  }

  const noInventory = unavailableRetentionInventory;

  function inputKeys(input: object, allowed: string[]): void { K.keys(input, allowed); }
  function uuid(input: string): void {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input))
      K.fail(400, "INVALID_INPUT", "작업 식별자가 올바르지 않습니다.");
  }
  function expiresAt(input: string): Date {
    const value = new Date(input);
    if (!Number.isFinite(value.getTime()) || value <= new Date() || value.getTime() > Date.now() + 7 * 86400_000)
      K.fail(400, "INVALID_INPUT", "승인 만료 시각은 현재부터 7일 안으로 지정하세요.");
    return value;
  }
  function reason(input: string): string {
    if (!input.trim() || input.length > 1000) K.fail(400, "INVALID_INPUT", "삭제 사유를 입력하세요.");
    return input.trim();
  }
  function snapshot(row: stored_objects): Snapshot {
    return {
      id: row.id, owner_user_id: row.owner_user_id, storage_code: row.storage_code,
      object_key: row.object_key, sha256: row.sha256, byte_size: row.byte_size.toString(),
      created_at: row.created_at.toISOString(), updated_at: row.updated_at.toISOString(),
      deleted_at: row.deleted_at?.toISOString() ?? null, purged_at: row.purged_at?.toISOString() ?? null,
    };
  }
  function bytes(row: Pick<stored_objects, "object_key" | "sha256" | "byte_size">): StoredBytes {
    return { objectKey: row.object_key, sha256: row.sha256, byteSize: row.byte_size };
  }
  function same(left: Snapshot, right: Snapshot): boolean {
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
      : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
        : value;
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  }

  async function rowForPurge(tx: K.Tx, id: string): Promise<stored_objects> {
    const row = await tx.stored_objects.findUnique({ where: { id } });
    if (!row || row.purged_at) K.fail(404, "NOT_FOUND", "저장 객체를 찾을 수 없습니다.");
    return row;
  }

  async function assertUnreferenced(tx: K.Tx, row: stored_objects, inventory: RetentionInventory): Promise<void> {
    const [restores] = await tx.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM accounts.command_receipts intent
      WHERE intent.command_type = 'storage_restore_intent'
        AND intent.result->'value'->>'object_id' = ${row.id}
        AND NOT EXISTS (
          SELECT 1 FROM accounts.command_receipts completion
          WHERE completion.command_type = 'storage_restore_complete'
            AND completion.result->'value'->>'restore_id' = intent.id::text
        )`;
    if (!restores || restores.count > 0n) K.fail(409, "RESTORE_PENDING", "완료를 확인하지 못한 파일 복원이 있어 제거할 수 없습니다.");
    const users = await tx.users.count({ where: { profile_photo_object_id: row.id, deleted_at: null } });
    const projects = await tx.projects.findMany({ where: { cover_photo_object_id: row.id }, select: { deleted_at: true } });
    const activeProjects = projects.filter((project) => project.deleted_at === null).length;
    const recoveryEnds = projects.flatMap((project) => project.deleted_at ? [new Date(project.deleted_at.getTime() + 30 * 86400_000)] : []);
    const recoverableContentUntil = recoveryEnds.length ? new Date(Math.max(...recoveryEnds.map((date) => date.getTime()))) : null;
    const proof = await inventory.inspect({ ...bytes(row), storageCode: row.storage_code });
    if (!proof || proof.storageCode !== row.storage_code || proof.objectKey !== row.object_key || proof.sha256 !== row.sha256 || proof.byteSize !== row.byte_size)
      K.fail(409, "BACKUP_EVIDENCE_UNAVAILABLE", "검증된 파일 백업 보존 증거가 없어 제거할 수 없습니다.");
    try {
      assertPurgeEligible({
        now: new Date(), currentReferenceCount: users + activeProjects,
        recoverableContentUntil, retainedBackupReferenceThrough: proof.retainUntil,
        backupEvidenceScannedAt: proof.scannedAt, backupEvidenceCoversThrough: proof.coversThrough,
        objectKey: proof.objectKey, sha256: proof.sha256,
      });
    } catch {
      K.fail(409, "PURGE_RETENTION", "현재 참조 또는 복구·백업 보존 기간이 끝나지 않았습니다.");
    }
  }

  export async function upload(authorization: string | undefined, adapter: Adapter, source: AsyncIterable<Uint8Array>, maximumBytes: number): Promise<stored_objects> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(adapter.storageCode)) K.fail(503, "STORAGE_UNAVAILABLE", "저장 위치 설정을 확인할 수 없습니다.");
    const actor = await K.transaction(async (tx) => {
      const currentActor = await AuthProvider.actor(authorization, tx);
      await K.active(tx, currentActor.id);
      await K.consent(tx, currentActor.id);
      return currentActor;
    });
    const stored = await adapter.storage.put(source, maximumBytes);
    try {
      return await K.transaction(async (tx) => {
        const currentActor = await AuthProvider.actor(authorization, tx);
        if (currentActor.id !== actor.id) K.fail(401, "UNAUTHORIZED", "유효한 계정이 필요합니다.");
        await K.active(tx, actor.id);
        await K.consent(tx, actor.id);
        return tx.stored_objects.create({ data: {
          owner_user_id: actor.id, storage_code: adapter.storageCode, object_key: stored.objectKey,
          sha256: stored.sha256, byte_size: stored.byteSize, ...K.audit(actor.id),
        } });
      });
    } catch (error) {
      try { await adapter.storage.removeVerified(stored.objectKey, stored); }
      catch {
        const receiptId = uuidV5(`knittinglog:storage-upload-orphan:${adapter.storageCode}:${stored.objectKey}`, uuidV5.URL);
        try {
          await K.transaction((tx) => K.command(tx, actor.id, receiptId, "storage_upload_orphan", {
            storage_code: adapter.storageCode, object_key: stored.objectKey,
            sha256: stored.sha256, byte_size: stored.byteSize.toString(),
          }, async () => ({ storage_code: adapter.storageCode, object_key: stored.objectKey,
            sha256: stored.sha256, byte_size: stored.byteSize.toString(), cleanup_pending: true })));
        } catch {
          throw new Error("Stored object registration failed; cleanup and durable orphan recording both failed");
        }
        throw new Error("Stored object registration failed; orphan cleanup failed and was recorded");
      }
      throw error;
    }
  }

  export async function restoreOriginalBytes(authorization: string | undefined, id: string, adapters: ReadonlyMap<string, StoragePort>, maximumBytes: number): Promise<{ bytes: Buffer; sha256: string; byteSize: bigint }> {
    const actor = await AuthProvider.actor(authorization);
    const row = await K.transaction(async (tx) => {
      const currentActor = await AuthProvider.actor(authorization, tx);
      if (currentActor.id !== actor.id) K.fail(401, "UNAUTHORIZED", "유효한 계정이 필요합니다.");
      const row = await tx.stored_objects.findFirst({ where: { id, owner_user_id: actor.id, deleted_at: null, purged_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "파일을 찾을 수 없습니다.");
      return row;
    });
    const adapter = adapters.get(row.storage_code);
    if (!adapter) K.fail(503, "STORAGE_UNAVAILABLE", "저장 위치를 확인할 수 없습니다.");
    return { bytes: await verifyStoredObject(adapter, bytes(row), maximumBytes), sha256: row.sha256, byteSize: row.byte_size };
  }

  export async function readOwned(authorization: string | undefined, id: string, adapters: ReadonlyMap<string, StoragePort>, maximumBytes: number): Promise<Buffer> {
    return (await restoreOriginalBytes(authorization, id, adapters, maximumBytes)).bytes;
  }

  export async function restoreFromBackup(
    authorization: string | undefined,
    id: string,
    source: () => AsyncIterable<Uint8Array>,
    adapters: ReadonlyMap<string, StoragePort>,
    maximumBytes: number,
    operationId: string,
  ): Promise<void> {
    uuid(id); uuid(operationId);
    const completionId = uuidV5(`knittinglog:storage-restore:${operationId.toLowerCase()}`, uuidV5.URL);
    const commandInput = { object_id: id };
    const work = await K.transaction(async (tx) => {
      const executor = await A.executor(tx, authorization);
      const row = await tx.stored_objects.findFirst({ where: { id, deleted_at: null, purged_at: null } });
      if (!row) K.fail(404, "NOT_FOUND", "복원할 수 있는 저장 객체를 찾을 수 없습니다.");
      const adapter = adapters.get(row.storage_code);
      if (!adapter) K.fail(503, "STORAGE_UNAVAILABLE", "저장 위치를 확인할 수 없습니다.");
      const previous = await tx.command_receipts.findUnique({ where: { id: operationId } });
      const intent = await K.command(tx, executor, operationId, "storage_restore_intent", commandInput, async () => ({ object_id: row.id, snapshot: snapshot(row) }));
      if (!same(snapshot(row), intent.snapshot)) K.fail(409, "RESTORE_STALE", "복원 준비 후 저장 객체 상태가 변경되었습니다.");
      const completion = await tx.command_receipts.findUnique({ where: { id: completionId } });
      if (completion) {
        const result = await K.command(tx, executor, completionId, "storage_restore_complete", { restore_id: operationId }, async (): Promise<{ succeeded: boolean }> => {
          K.fail(409, "OPERATION_CONFLICT", "파일 복원 완료 기록을 확인할 수 없습니다.");
        });
        if (!result.succeeded) K.fail(409, "RESTORE_FAILED", "실패한 복원은 새 명령으로 검토해야 합니다.");
        return { completed: true, executor, adapter, object: bytes(row) };
      }
      if (previous) K.fail(409, "RESTORE_PENDING", "실행 중이거나 완료를 확인하지 못한 복원입니다. 기존 실행을 먼저 확인하세요.");
      return { completed: false, executor, adapter, object: bytes(row) };
    });
    if (work.completed) return;
    let failed = false;
    let failure: unknown;
    try {
      await work.adapter.restoreVerified(work.object.objectKey, source(), work.object, maximumBytes);
    } catch (error) {
      failed = true;
      failure = error;
    }
    // 외부 작업이 끝난 뒤에만 완료를 기록합니다. 중단된 의도는 만료로 해제하지 않습니다.
    await K.transaction((tx) => K.command(tx, work.executor, completionId, "storage_restore_complete", { restore_id: operationId }, async () => ({
      restore_id: operationId.toLowerCase(), object_id: id, succeeded: !failed,
    })));
    if (failed) throw failure;
  }

  export async function preparePurge(
    authorization: string | undefined,
    input: PurgePrepare,
    adapters: ReadonlyMap<string, StoragePort>,
    inventory: RetentionInventory = noInventory,
  ): Promise<{ approval_id: string; expires_at: string }> {
    inputKeys(input, ["operation_id", "object_id", "executor_user_id", "reason", "expires_at"]);
    uuid(input.operation_id); uuid(input.object_id); uuid(input.executor_user_id);
    return K.transaction(async (tx) => {
      const approver = await A.approver(tx, authorization);
      const why = reason(input.reason);
      const expiration = expiresAt(input.expires_at).toISOString();
      if (approver === input.executor_user_id || !A.isExecutor(input.executor_user_id))
        K.fail(403, "FORBIDDEN", "별도 지정한 운영 실행자가 필요합니다.");
      return K.command(tx, approver, input.operation_id, "storage_purge_approval", input, async () => {
        const row = await rowForPurge(tx, input.object_id);
        if (row.purged_at) K.fail(409, "STORAGE_STATE", "저장 객체 상태를 확인할 수 없습니다.");
        if (!adapters.has(row.storage_code)) K.fail(503, "STORAGE_UNAVAILABLE", "저장 위치를 확인할 수 없습니다.");
        await assertUnreferenced(tx, row, inventory);
        const staged = row.deleted_at ? row : await tx.stored_objects.update({
          where: { id: row.id }, data: { deleted_at: new Date(), ...K.changed(approver) },
        });
        const approval: Approval = {
          approver_user_id: approver, executor_user_id: input.executor_user_id, reason: why,
          expires_at: expiration, snapshot: snapshot(staged),
        };
        return { approval_id: input.operation_id, expires_at: expiration, approval };
      });
    });
  }

  async function approval(tx: K.Tx, id: string): Promise<Approval> {
    const receipt = await tx.command_receipts.findUnique({ where: { id } });
    if (!receipt || receipt.deleted_at || receipt.command_type !== "storage_purge_approval") K.fail(404, "APPROVAL_NOT_FOUND", "파일 제거 승인을 찾을 수 없습니다.");
    const value = (receipt.result as { value?: { approval?: unknown } }).value?.approval;
    if (!typia.is<Approval>(value)) K.fail(409, "APPROVAL_INVALID", "파일 제거 승인 기록이 올바르지 않습니다.");
    if (receipt.actor_user_id !== value.approver_user_id || value.approver_user_id === value.executor_user_id || !Number.isFinite(Date.parse(value.expires_at)))
      K.fail(409, "APPROVAL_INVALID", "파일 제거 승인 주체와 만료 시각을 확인할 수 없습니다.");
    return value;
  }

  export async function executePurge(
    authorization: string | undefined,
    input: PurgeExecute,
    adapters: ReadonlyMap<string, StoragePort>,
    inventory: RetentionInventory = noInventory,
    expectedObjectId?: string,
  ): Promise<{ purged_at: string }> {
    inputKeys(input, ["operation_id", "approval_id"]); uuid(input.operation_id); uuid(input.approval_id);
    const completionId = uuidV5(`knittinglog:storage-purge:${input.operation_id.toLowerCase()}`, uuidV5.URL);
    const commandInput = { approval_id: input.approval_id };
    const work = await K.transaction(async (tx) => {
      const executor = await A.executor(tx, authorization);
      const approved = await approval(tx, input.approval_id);
      const approver = await tx.users.findFirst({ where: { id: approved.approver_user_id, deleted_at: null } });
      if (!approver || !A.isApprover(approved.approver_user_id)) K.fail(403, "APPROVAL_REVOKED", "승인자 권한이 변경되었거나 비활성화됐습니다.");
      if (expectedObjectId && approved.snapshot.id !== expectedObjectId) K.fail(404, "NOT_FOUND", "파일 제거 승인을 찾을 수 없습니다.");
      const previous = await tx.command_receipts.findUnique({ where: { id: input.operation_id } });
      if (previous) {
        await K.command(tx, executor, input.operation_id, "storage_purge_intent", commandInput, async () => ({ approval_id: input.approval_id }));
        const completion = await tx.command_receipts.findUnique({ where: { id: completionId } });
        if (completion) {
          const completed = await K.command(tx, executor, completionId, "storage_purge_execute", commandInput, async (): Promise<{ approval_id: string; purged_at: string }> => {
            K.fail(409, "OPERATION_CONFLICT", "파일 제거 완료 기록을 확인할 수 없습니다.");
          });
          return { completed, executor, adapter: undefined, stored: undefined, approval: approved };
        }
      }
      if (!previous && await tx.command_receipts.findUnique({ where: { id: completionId } }))
        K.fail(409, "OPERATION_CONFLICT", "파일 제거 완료 식별자가 이미 사용되었습니다.");
      if (approved.executor_user_id !== executor || new Date(approved.expires_at) <= new Date())
        K.fail(403, "APPROVAL_EXPIRED", "지정된 실행자와 유효한 승인이 필요합니다.");
      const row = await rowForPurge(tx, approved.snapshot.id);
      const current = snapshot(row);
      if (!same(current, approved.snapshot) || !row.deleted_at) K.fail(409, "APPROVAL_STALE", "승인 후 저장 객체 상태가 변경됐습니다.");
      const adapter = adapters.get(row.storage_code);
      if (!adapter) K.fail(503, "STORAGE_UNAVAILABLE", "저장 위치를 확인할 수 없습니다.");
      await assertUnreferenced(tx, row, inventory);
      if (await tx.command_receipts.count({ where: {
        id: { not: input.operation_id }, command_type: "storage_purge_intent",
        result: { path: ["value", "approval_id"], equals: input.approval_id },
      } })) K.fail(409, "APPROVAL_USED", "이 승인은 다른 제거 명령에서 사용 중입니다.");
      // 외부 제거 전에 명령 UUID를 확정합니다. 완료 영수증은 별도 불변 행으로 남깁니다.
      await K.command(tx, executor, input.operation_id, "storage_purge_intent", commandInput, async () => ({ approval_id: input.approval_id }));
      return { completed: undefined, executor, adapter, stored: bytes(row), approval: approved };
    });

    if (work.completed) return { purged_at: work.completed.purged_at };

    await work.adapter!.removeVerified(work.stored!.objectKey, work.stored!);
    return K.transaction(async (tx) => {
      const executor = await A.executor(tx, authorization);
      if (executor !== work.executor) K.fail(403, "FORBIDDEN", "승인 실행자가 변경됐습니다.");
      const result = await K.command(tx, executor, completionId, "storage_purge_execute", commandInput, async () => {
        const currentApproval = await approval(tx, input.approval_id);
        if (currentApproval.executor_user_id !== executor || Date.parse(currentApproval.expires_at) <= Date.now() ||
            !A.isApprover(currentApproval.approver_user_id) || !await tx.users.findFirst({ where: { id: currentApproval.approver_user_id, deleted_at: null } }))
          K.fail(403, "APPROVAL_REVOKED", "현재 유효한 파일 제거 승인이 필요합니다.");
        const target = await tx.stored_objects.findUnique({ where: { id: work.approval.snapshot.id } });
        if (!target || target.purged_at || !same(snapshot(target), work.approval.snapshot)) K.fail(409, "APPROVAL_STALE", "승인 후 저장 객체 상태가 변경됐습니다.");
        await assertUnreferenced(tx, target, inventory);
        const purgedAt = new Date();
        await tx.stored_objects.update({ where: { id: target.id }, data: { purged_at: purgedAt, ...K.changed(executor) } });
        return { approval_id: input.approval_id, purged_at: purgedAt.toISOString() };
      });
      return { purged_at: result.purged_at };
    });
  }
}
